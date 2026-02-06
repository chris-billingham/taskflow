import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../errors/index.js';
import type { CreateFilterInput, UpdateFilterInput } from '../schemas/filter.js';
import { parseFilterQuery, validateFilterQuery } from '../utils/filterParser.js';

export async function getUserFilters(userId: string) {
  return prisma.filter.findMany({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function createFilter(data: CreateFilterInput, userId: string) {
  const maxSort = await prisma.filter.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });

  return prisma.filter.create({
    data: {
      name: data.name,
      query: data.query,
      color: data.color ?? '#6B7280',
      viewStyle: data.viewStyle ?? 'LIST',
      userId,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updateFilter(id: string, data: UpdateFilterInput, userId: string) {
  const filter = await prisma.filter.findUnique({ where: { id } });
  if (!filter) throw new NotFoundError('Filter not found');
  if (filter.userId !== userId) throw new ForbiddenError('You do not own this filter');

  return prisma.filter.update({ where: { id }, data });
}

export async function deleteFilter(id: string, userId: string) {
  const filter = await prisma.filter.findUnique({ where: { id } });
  if (!filter) throw new NotFoundError('Filter not found');
  if (filter.userId !== userId) throw new ForbiddenError('You do not own this filter');

  await prisma.filter.delete({ where: { id } });
  return { message: 'Filter deleted successfully' };
}

export async function executeFilter(query: string, userId: string) {
  const where = await parseFilterQuery(query, userId);

  // Scope to projects the user owns or is a member of
  const userProjects = await prisma.project.findMany({
    where: {
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } },
      ],
    },
    select: { id: true },
  });
  const projectIds = userProjects.map((p) => p.id);

  const tasks = await prisma.task.findMany({
    where: {
      AND: [
        { projectId: { in: projectIds } },
        where,
      ],
    },
    include: {
      taskLabels: {
        include: { label: { select: { id: true, name: true, color: true } } },
      },
      assignee: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
      project: { select: { id: true, name: true, color: true } },
      section: { select: { id: true, name: true } },
      _count: { select: { subtasks: true, comments: true } },
    },
    orderBy: [
      { priority: 'asc' },
      { dueDate: 'asc' },
      { sortOrder: 'asc' },
    ],
    take: 200,
  });

  return tasks;
}

export { validateFilterQuery };
