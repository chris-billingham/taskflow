import type { ProjectRole } from '@prisma/client';
import { prisma } from '../config/database.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors/index.js';
import { hasProjectAccess, requireProjectAccess } from './access.js';
import { createNotification } from './notificationService.js';
import { logActivity } from './activityService.js';
import { logFailure } from '../config/logger.js';
import { refreshUserRooms } from '../websocket/handlers.js';
import { WS_EVENTS, emitToUser } from '../websocket/events.js';
import type { ShareProjectInput } from '@taskflow/contract';

// Sharing one project with specific people (project_members), on top of
// whatever the project's workspace already grants. Project admins manage the
// list; anyone on it may take themselves off.

const person = { select: { id: true, name: true, email: true, avatarUrl: true } } as const;

/** Who a project is shared with. Anyone who can see the project may look. */
export async function getProjectSharing(projectId: string, userId: string) {
  await requireProjectAccess(projectId, userId, 'VIEW');
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      owner: person,
      workspace: { select: { id: true, name: true } },
      members: { include: { user: person }, orderBy: { addedAt: 'asc' } },
    },
  });
  const canManage = await hasProjectAccess(projectId, userId, 'ADMIN');
  // People who may only comment or view see names, not addresses.
  const canSeeEmails = await hasProjectAccess(projectId, userId, 'EDIT');
  const shown = <T extends { email: string }>(u: T) => (canSeeEmails ? u : { ...u, email: null });

  return {
    owner: project.owner ? shown(project.owner) : null,
    workspace: project.workspace,
    collaborators: project.members.map((m) => ({ user: shown(m.user), role: m.role, addedAt: m.addedAt })),
    canManage,
  };
}

export async function shareProject(projectId: string, input: ShareProjectInput, userId: string) {
  const project = await requireProjectAccess(projectId, userId, 'ADMIN');
  if (project.isInbox) throw new ValidationError('The Inbox cannot be shared');

  const invitee = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, isActive: true },
  });
  if (!invitee || !invitee.isActive) {
    throw new NotFoundError(
      'No one with that email address has an account here. Ask an administrator to add them first.',
    );
  }
  if (invitee.id === project.ownerId) throw new ConflictError('That person owns this project');
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: invitee.id } },
  });
  if (existing) throw new ConflictError('This project is already shared with them');

  const member = await prisma.projectMember.create({
    data: { projectId, userId: invitee.id, role: input.role },
    include: { user: person },
  });

  await refreshUserRooms(invitee.id);
  emitToUser(invitee.id, WS_EVENTS.PROJECT_SHARED, { projectId });

  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  createNotification(
    invitee.id,
    'PROJECT_SHARED',
    `${actor?.name ?? 'Someone'} shared “${project.name}” with you`,
    `You can now find it under Shared with me.`,
    { projectId },
  ).catch(logFailure('share notification failed', { projectId }));
  logActivity({
    action: 'SHARED',
    entityType: 'PROJECT',
    entityId: projectId,
    userId,
    newData: { userId: invitee.id, role: input.role },
  }).catch(logFailure('activity log failed'));

  return { user: member.user, role: member.role, addedAt: member.addedAt };
}

export async function updateCollaborator(
  projectId: string,
  collaboratorId: string,
  role: ProjectRole,
  userId: string,
) {
  await requireProjectAccess(projectId, userId, 'ADMIN');
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: collaboratorId } },
  });
  if (!existing) throw new NotFoundError('This project is not shared with that person');
  // Admins can't demote themselves into a project nobody can manage.
  if (collaboratorId === userId && role !== 'ADMIN' && !(await hasOtherAdmin(projectId, userId))) {
    throw new ForbiddenError('Make someone else an admin of this project first');
  }

  const member = await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId: collaboratorId } },
    data: { role },
    include: { user: person },
  });
  return { user: member.user, role: member.role, addedAt: member.addedAt };
}

/** Take someone off a project: an admin removing them, or them leaving. */
export async function removeCollaborator(projectId: string, collaboratorId: string, userId: string) {
  if (collaboratorId !== userId) {
    await requireProjectAccess(projectId, userId, 'ADMIN');
  }
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: collaboratorId } },
  });
  if (!existing) throw new NotFoundError('This project is not shared with that person');

  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId: collaboratorId } },
  });

  // An assignee can always work their task, so tasks still assigned to them
  // would keep the project's tasks visible. Unassign them unless they still
  // have access some other way (e.g. through the workspace).
  if (!(await hasProjectAccess(projectId, collaboratorId))) {
    await prisma.task.updateMany({
      where: { projectId, assigneeId: collaboratorId },
      data: { assigneeId: null },
    });
  }

  await refreshUserRooms(collaboratorId);
  emitToUser(collaboratorId, WS_EVENTS.PROJECT_UNSHARED, { projectId });
  return { message: collaboratorId === userId ? 'You left the project' : 'Removed from the project' };
}

async function hasOtherAdmin(projectId: string, userId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { ownerId: true, workspaceId: true },
  });
  if (project.ownerId && project.ownerId !== userId) return true;
  const otherAdmin = await prisma.projectMember.count({
    where: { projectId, role: 'ADMIN', userId: { not: userId } },
  });
  if (otherAdmin > 0) return true;
  if (!project.workspaceId) return false;
  return (
    (await prisma.workspaceMember.count({
      where: { workspaceId: project.workspaceId, role: { in: ['OWNER', 'ADMIN'] }, userId: { not: userId } },
    })) > 0
  );
}
