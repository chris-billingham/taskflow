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

  return comment;
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
