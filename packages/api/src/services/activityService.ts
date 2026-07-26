import { prisma } from '../config/database.js';
import { requireTaskAccess, requireProjectAccess } from './access.js';
import type { ActivityAction, EntityType, Prisma } from '@prisma/client';

const activityInclude = {
  user: {
    select: { id: true, name: true, avatarUrl: true },
  },
};

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

export async function getTaskActivity(
  taskId: string,
  userId: string,
  limit = 50,
) {
  await requireTaskAccess(taskId, userId, 'VIEW');

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
  await requireProjectAccess(projectId, userId, 'VIEW');

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
