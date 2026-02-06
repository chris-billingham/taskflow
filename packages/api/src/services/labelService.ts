import { prisma } from '../config/database.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors/index.js';
import type { CreateLabelInput, UpdateLabelInput } from '../schemas/label.js';

export async function getUserLabels(userId: string) {
  return prisma.label.findMany({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function createLabel(data: CreateLabelInput, userId: string) {
  // Check for duplicate name
  const existing = await prisma.label.findUnique({
    where: { userId_name: { userId, name: data.name } },
  });
  if (existing) {
    throw new ConflictError('A label with this name already exists');
  }

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
    const existing = await prisma.label.findUnique({
      where: { userId_name: { userId, name: data.name } },
    });
    if (existing) {
      throw new ConflictError('A label with this name already exists');
    }
  }

  return prisma.label.update({ where: { id }, data });
}

export async function deleteLabel(id: string, userId: string) {
  const label = await prisma.label.findUnique({ where: { id } });
  if (!label) throw new NotFoundError('Label not found');
  if (label.userId !== userId) throw new ForbiddenError('You do not own this label');

  await prisma.label.delete({ where: { id } });
  return { message: 'Label deleted successfully' };
}
