// Reading tasks: the paged list and the single-task detail.
import { prisma } from '../../config/database.js';
import type { Prisma } from '@prisma/client';
import { NotFoundError } from '../../errors/index.js';
import { requireTaskAccess, taskAccessWhere } from '../access.js';
import type { TaskQuery } from '@taskflow/contract';
import { cursorArgs, toPage } from '../../utils/pagination.js';
import { taskInclude, taskListInclude } from './support.js';

export async function getTasks(query: TaskQuery, userId: string) {
  const where: Prisma.TaskWhereInput = {
    AND: [taskAccessWhere(userId)],
    projectId: query.projectId,
    sectionId: query.sectionId,
    parentId: query.parentId ?? null,
    ...(query.completed !== undefined && { isCompleted: query.completed === 'true' }),
    ...(query.assigneeId && { assigneeId: query.assigneeId }),
    ...(query.priority && { priority: { in: query.priority.split(',').map(Number) } }),
    ...(query.labels && { taskLabels: { some: { labelId: { in: query.labels.split(',') } } } }),
    ...(query.search && { content: { contains: query.search, mode: 'insensitive' } }),
    ...((query.dueDateFrom || query.dueDateTo) && {
      dueDate: {
        ...(query.dueDateFrom && { gte: new Date(query.dueDateFrom) }),
        ...(query.dueDateTo && { lte: new Date(query.dueDateTo) }),
      },
    }),
  };

  const limit = query.limit ?? 100;
  const rows = await prisma.task.findMany({
    where,
    include: taskListInclude,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    ...cursorArgs(limit, query.cursor),
  });

  const { items, nextCursor } = toPage(rows, limit);
  return { tasks: items, nextCursor };
}

export async function getTaskById(id: string, userId: string) {
  await requireTaskAccess(id, userId, 'VIEW');

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      ...taskInclude,
      project: {
        select: { id: true, name: true, color: true },
      },
      section: {
        select: { id: true, name: true },
      },
      parent: {
        select: { id: true, content: true },
      },
      comments: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          author: {
            select: { id: true, name: true, avatarUrl: true },
          },
        },
      },
    },
  });

  if (!task) {
    throw new NotFoundError('Task not found');
  }

  return task;
}
