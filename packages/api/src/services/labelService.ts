import { prisma } from '../config/database.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors/index.js';
import type { CreateLabelInput, UpdateLabelInput } from '@taskflow/contract';

export async function getUserLabels(userId: string) {
  return prisma.label.findMany({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
  });
}

/**
 * Label names are unique per user regardless of case: quick add's @name and
 * the filter @name match case-insensitively, so "Urgent" and "urgent" side by
 * side would be indistinguishable there. (The database constraint is
 * case-sensitive; this check is the rule.)
 */
async function assertNameFree(userId: string, name: string, exceptId?: string) {
  const sameName = await prisma.label.findMany({
    where: { userId, name: { equals: name, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  // Insensitive equals is an unescaped ILIKE; compare exactly here.
  if (sameName.some((l) => l.id !== exceptId && l.name.toLowerCase() === name.toLowerCase())) {
    throw new ConflictError('A label with this name already exists');
  }
}

export async function createLabel(data: CreateLabelInput, userId: string) {
  await assertNameFree(userId, data.name);

  const maxSort = await prisma.label.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });

  return prisma.label.create({
    data: {
      name: data.name,
      color: data.color ?? '#6B7280',
      userId,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updateLabel(id: string, data: UpdateLabelInput, userId: string) {
  const label = await prisma.label.findUnique({ where: { id } });
  if (!label) throw new NotFoundError('Label not found');
  if (label.userId !== userId) throw new ForbiddenError('You do not own this label');

  if (data.name && data.name !== label.name) {
    await assertNameFree(userId, data.name, id);
  }

  return prisma.label.update({ where: { id }, data });
}

export async function deleteLabel(id: string, userId: string) {
  const label = await prisma.label.findUnique({ where: { id } });
  if (!label) throw new NotFoundError('Label not found');
  if (label.userId !== userId) throw new ForbiddenError('You do not own this label');

  // Remove label from all tasks first, then delete label
  await prisma.taskLabel.deleteMany({ where: { labelId: id } });
  await prisma.label.delete({ where: { id } });
  return { message: 'Label deleted successfully' };
}

export async function reorderLabels(labelIds: string[], userId: string) {
  if (labelIds.length === 0) return { message: 'Nothing to reorder' };

  const labels = await prisma.label.findMany({
    where: { id: { in: labelIds } },
  });

  if (labels.length !== labelIds.length) {
    throw new NotFoundError('One or more labels not found');
  }

  for (const label of labels) {
    if (label.userId !== userId) {
      throw new ForbiddenError('You do not own all of these labels');
    }
  }

  const updates = labelIds.map((id, index) =>
    prisma.label.update({
      where: { id },
      data: { sortOrder: index },
    }),
  );

  await prisma.$transaction(updates);

  return { message: 'Labels reordered successfully' };
}
