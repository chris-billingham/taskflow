import { prisma } from '../config/database.js';
import { taskAccessWhere } from './access.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors/index.js';
import type { CreateFilterInput, UpdateFilterInput } from '@taskflow/contract';
import { parseFilterQuery, validateFilterQuery } from '../utils/filterParser.js';
import { cursorArgs, toPage } from '../utils/pagination.js';

/** Reject a malformed query before it is saved or run: the parser is lenient
 * and would otherwise quietly drop the broken part and widen the results. */
function assertValidQuery(query: string) {
  const result = validateFilterQuery(query);
  if (!result.valid) {
    throw new ValidationError(result.error ?? 'Invalid filter query');
  }
}

export async function getUserFilters(userId: string) {
  return prisma.filter.findMany({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function createFilter(data: CreateFilterInput, userId: string) {
  assertValidQuery(data.query);
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
  if (data.query !== undefined) assertValidQuery(data.query);

  return prisma.filter.update({ where: { id }, data });
}

export async function deleteFilter(id: string, userId: string) {
  const filter = await prisma.filter.findUnique({ where: { id } });
  if (!filter) throw new NotFoundError('Filter not found');
  if (filter.userId !== userId) throw new ForbiddenError('You do not own this filter');

  await prisma.filter.delete({ where: { id } });
  return { message: 'Filter deleted successfully' };
}

export async function executeFilter(
  query: string,
  userId: string,
  limit = 100,
  cursor?: string,
) {
  assertValidQuery(query);
  const where = await parseFilterQuery(query, userId);

  const tasks = await prisma.task.findMany({
    where: {
      AND: [
        // Full visibility scope: owned, direct-member, workspace, assigned.
        taskAccessWhere(userId),
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
      { id: 'asc' },
    ],
    ...cursorArgs(limit, cursor),
  });

  return toPage(tasks, limit);
}

export { validateFilterQuery };
