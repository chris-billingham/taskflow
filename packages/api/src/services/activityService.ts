import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../errors/index.js';
import type { ActivityAction, EntityType, Prisma } from '@prisma/client';

interface LogActivityInput {
  action: ActivityAction;
  entityType: EntityType;
  entityId: string;
  userId: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  taskId?: string;
}

export async function logActivity(input: LogActivityInput) {
  return prisma.activityLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      userId: input.userId,
      oldData: (input.oldData as Prisma.InputJsonValue) ?? undefined,
      newData: (input.newData as Prisma.InputJsonValue) ?? undefined,
      taskId: input.taskId,
    },
  });
}

async function verifyTaskAccess(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { ownerId: true } } },
  });
  if (!task) {
    throw new NotFoundError('Task not found');
  }
  if (task.project.ownerId !== userId && task.creatorId !== userId) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: task.projectId, userId } },
    });
    if (!member) {
      throw new ForbiddenError('You do not have access to this task');
    }
  }
  return task;
}

async function verifyProjectAccess(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true },
  });
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  if (project.ownerId !== userId) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) {
      throw new ForbiddenError('You do not have access to this project');
    }
  }
  return project;
}

const activityInclude = {
  user: {
    select: { id: true, name: true, avatarUrl: true },
  },
};

export async function getTaskActivity(
  taskId: string,
  userId: string,
  limit = 50,
) {
  await verifyTaskAccess(taskId, userId);

  return prisma.activityLog.findMany({
    where: { taskId },
    include: activityInclude,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getProjectActivity(
  projectId: string,
  userId: string,
  limit = 50,
) {
  await verifyProjectAccess(projectId, userId);

  return prisma.activityLog.findMany({
    where: {
      OR: [
        { task: { projectId } },
        { entityType: 'PROJECT', entityId: projectId },
      ],
    },
    include: activityInclude,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getUserActivity(userId: string, limit = 50) {
  return prisma.activityLog.findMany({
    where: { userId },
    include: activityInclude,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
