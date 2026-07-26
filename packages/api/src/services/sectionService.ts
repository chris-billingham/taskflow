import { prisma } from '../config/database.js';
import { NotFoundError } from '../errors/index.js';
import { requireProjectAccess } from './access.js';
import type { CreateSectionInput, UpdateSectionInput } from '../schemas/section.js';
import {
  broadcastSectionCreated,
  broadcastSectionUpdated,
  broadcastSectionDeleted,
} from './syncService.js';

async function requireSectionAccess(
  sectionId: string,
  userId: string,
  level: 'VIEW' | 'EDIT',
) {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { id: true, name: true, projectId: true, sortOrder: true },
  });
  if (!section) {
    throw new NotFoundError('Section not found');
  }
  await requireProjectAccess(section.projectId, userId, level);
  return section;
}

export async function getProjectSections(projectId: string, userId: string) {
  await requireProjectAccess(projectId, userId, 'VIEW');

  return prisma.section.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: {
        select: { tasks: { where: { isCompleted: false } } },
      },
    },
  });
}

export async function createSection(data: CreateSectionInput, userId: string) {
  await requireProjectAccess(data.projectId, userId, 'EDIT');

  // Get max sortOrder
  const maxSort = await prisma.section.aggregate({
    where: { projectId: data.projectId },
    _max: { sortOrder: true },
  });

  const section = await prisma.section.create({
    data: {
      name: data.name,
      projectId: data.projectId,
      sortOrder: data.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
    },
    include: {
      _count: {
        select: { tasks: { where: { isCompleted: false } } },
      },
    },
  });

  broadcastSectionCreated(section);

  return section;
}

export async function updateSection(
  id: string,
  data: UpdateSectionInput,
  userId: string,
) {
  await requireSectionAccess(id, userId, 'EDIT');

  const section = await prisma.section.update({
    where: { id },
    data,
    include: {
      _count: {
        select: { tasks: { where: { isCompleted: false } } },
      },
    },
  });

  broadcastSectionUpdated(section);

  return section;
}

export async function deleteSection(id: string, userId: string) {
  const section = await requireSectionAccess(id, userId, 'EDIT');

  // Move tasks to no section
  await prisma.task.updateMany({
    where: { sectionId: id },
    data: { sectionId: null },
  });

  await prisma.section.delete({ where: { id } });

  broadcastSectionDeleted(id, section.projectId);

  return { message: 'Section deleted successfully' };
}

export async function reorderSections(sectionIds: string[], userId: string) {
  if (sectionIds.length === 0) return { message: 'Nothing to reorder' };

  // Verify all sections exist and the user may edit their projects
  const sections = await prisma.section.findMany({
    where: { id: { in: sectionIds } },
    select: { id: true, projectId: true },
  });

  if (sections.length !== sectionIds.length) {
    throw new NotFoundError('One or more sections not found');
  }

  for (const projectId of new Set(sections.map((s) => s.projectId))) {
    await requireProjectAccess(projectId, userId, 'EDIT');
  }

  const updates = sectionIds.map((id, index) =>
    prisma.section.update({
      where: { id },
      data: { sortOrder: index },
    }),
  );

  await prisma.$transaction(updates);

  return { message: 'Sections reordered successfully' };
}
