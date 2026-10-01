import { prisma } from '../config/database.js';
import { requireTaskAccess, requireProjectAccess } from './access.js';
import type { ActivityAction, EntityType, Prisma } from '@prisma/client';
import { cursorArgs, toPage } from '../utils/pagination.js';

const activityInclude = {
  user: {
    select: { id: true, name: true, avatarUrl: true },
  },
  // Which task it was about, for feeds that span a whole project.
  task: {
    select: { id: true, content: true },
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
  cursor?: string,
) {
  await requireTaskAccess(taskId, userId, 'VIEW');

  const rows = await prisma.activityLog.findMany({
    where: { taskId },
    include: activityInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...cursorArgs(limit, cursor),
  });
  return toPage(rows, limit);
}

export async function getProjectActivity(
  projectId: string,
  userId: string,
  limit = 50,
  cursor?: string,
) {
  await requireProjectAccess(projectId, userId, 'VIEW');

  const rows = await prisma.activityLog.findMany({
    where: {
      OR: [
        { task: { projectId } },
        { entityType: 'PROJECT', entityId: projectId },
      ],
    },
    include: activityInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...cursorArgs(limit, cursor),
  });
  return toPage(rows, limit);
}

export async function getUserActivity(userId: string, limit = 50, cursor?: string) {
  const rows = await prisma.activityLog.findMany({
    where: { userId },
    include: activityInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...cursorArgs(limit, cursor),
  });
  return toPage(rows, limit);
}
