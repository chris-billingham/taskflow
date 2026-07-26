import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../errors/index.js';
import { requireTaskAccess } from './access.js';
import type { CreateCommentInput, UpdateCommentInput } from '../schemas/comment.js';
import { logActivity } from './activityService.js';
import {
  broadcastCommentCreated,
  broadcastCommentUpdated,
  broadcastCommentDeleted,
} from './syncService.js';
import { notifyMany } from './notificationService.js';
import { resolveMentions, type MentionCandidate } from '../utils/mentions.js';

const authorSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
};

export async function getTaskComments(
  taskId: string,
  userId: string,
  limit = 50,
  cursor?: string,
) {
  await requireTaskAccess(taskId, userId, 'VIEW');

  const comments = await prisma.comment.findMany({
    where: { taskId, parentId: null },
    include: {
      author: { select: authorSelect },
      replies: {
        include: {
          author: { select: authorSelect },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  return comments;
}

export async function createComment(
  taskId: string,
  data: CreateCommentInput,
  userId: string,
) {
  const task = await requireTaskAccess(taskId, userId, 'COMMENT');

  // Validate parentId if provided
  if (data.parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: data.parentId },
    });
    if (!parent || parent.taskId !== taskId) {
      throw new NotFoundError('Parent comment not found');
    }
  }

  const comment = await prisma.comment.create({
    data: {
      content: data.content,
      authorId: userId,
      taskId,
      parentId: data.parentId,
    },
    include: {
      author: { select: authorSelect },
      replies: {
        include: {
          author: { select: authorSelect },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  logActivity({
    action: 'COMMENTED',
    entityType: 'COMMENT',
    entityId: comment.id,
    userId,
    taskId,
    newData: { content: data.content },
  }).catch(console.error);

  broadcastCommentCreated(comment, task.projectId);

  // Fire-and-forget, like the activity log above: a notification failure must
  // not fail the comment that is already committed.
  notifyComment(task, comment, data.parentId ?? null, userId).catch((err) =>
    console.warn('[commentService] comment notifications failed:', err),
  );

  return comment;
}

/**
 * Notify the people with a stake in a task when it gets a new comment.
 *
 * Nothing in the app produced COMMENT_ON_TASK or MENTION_IN_COMMENT before
 * this, so both preference toggles governed events that never happened.
 *
 * Recipients are the task's creator, its assignee, and the author of the
 * comment being replied to. Anyone explicitly @mentioned gets the mention
 * notice INSTEAD of the generic one — being told twice about the same comment
 * reads as a bug, and the mention is the more specific fact.
 */
async function notifyComment(
  task: { id: string; content: string; projectId: string; creatorId: string | null; assigneeId: string | null },
  comment: { id: string; content: string },
  parentId: string | null,
  authorId: string,
) {
  const [author, parent, candidates] = await Promise.all([
    prisma.user.findUnique({ where: { id: authorId }, select: { name: true } }),
    parentId
      ? prisma.comment.findUnique({
          where: { id: parentId },
          select: { authorId: true },
        })
      : Promise.resolve(null),
    // Mentions resolve only against people who can already see the task, so a
    // comment can't notify (or probe for) accounts in another tenant.
    getTaskAudience(task.projectId),
  ]);

  const authorName = author?.name ?? 'Someone';
  const mentioned = resolveMentions(comment.content, candidates).filter(
    (id) => id !== authorId,
  );

  await notifyMany(mentioned, {
    exclude: authorId,
    type: 'MENTION_IN_COMMENT',
    title: `${authorName} mentioned you`,
    body: `${authorName} mentioned you on "${task.content}": ${comment.content}`,
    data: { taskId: task.id, projectId: task.projectId, commentId: comment.id },
  });

  const mentionedSet = new Set(mentioned);
  const others = [task.creatorId, task.assigneeId, parent?.authorId].filter(
    (id): id is string => !!id && !mentionedSet.has(id),
  );

  await notifyMany(others, {
    exclude: authorId,
    type: 'COMMENT_ON_TASK',
    title: `New comment on "${task.content}"`,
    body: `${authorName}: ${comment.content}`,
    data: { taskId: task.id, projectId: task.projectId, commentId: comment.id },
  });
}

/**
 * Everyone who can see a project, as mention candidates: the owner, direct
 * project members, and — for a workspace project — the workspace's members.
 */
async function getTaskAudience(projectId: string): Promise<MentionCandidate[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      workspaceId: true,
      owner: { select: { id: true, name: true, email: true } },
      members: { select: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!project) return [];

  const byId = new Map<string, MentionCandidate>();
  if (project.owner) byId.set(project.owner.id, project.owner);
  for (const member of project.members) {
    byId.set(member.user.id, member.user);
  }

  if (project.workspaceId) {
    const wsMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId: project.workspaceId },
      select: { user: { select: { id: true, name: true, email: true } } },
    });
    for (const member of wsMembers) {
      byId.set(member.user.id, member.user);
    }
  }

  return [...byId.values()];
}

export async function updateComment(
  id: string,
  data: UpdateCommentInput,
  userId: string,
) {
  const comment = await prisma.comment.findUnique({
    where: { id },
    include: { task: { include: { project: { select: { ownerId: true } } } } },
  });

  if (!comment) {
    throw new NotFoundError('Comment not found');
  }
  if (comment.authorId !== userId) {
    throw new ForbiddenError('You can only edit your own comments');
  }

  const updated = await prisma.comment.update({
    where: { id },
    data: { content: data.content },
    include: {
      author: { select: authorSelect },
      replies: {
        include: {
          author: { select: authorSelect },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (comment.task?.projectId) {
    broadcastCommentUpdated(updated, comment.task.projectId);
  }

  return updated;
}

export async function deleteComment(id: string, userId: string) {
  const comment = await prisma.comment.findUnique({
    where: { id },
    include: { task: { select: { projectId: true } } },
  });

  if (!comment) {
    throw new NotFoundError('Comment not found');
  }
  if (comment.authorId !== userId) {
    throw new ForbiddenError('You can only delete your own comments');
  }

  await prisma.comment.delete({ where: { id } });

  if (comment.task?.projectId) {
    broadcastCommentDeleted(id, comment.taskId, comment.task.projectId);
  }

  return { message: 'Comment deleted successfully' };
}
