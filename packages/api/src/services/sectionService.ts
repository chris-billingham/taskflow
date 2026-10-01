import { prisma } from '../config/database.js';
import { NotFoundError } from '../errors/index.js';
import { requireProjectAccess } from './access.js';
import type { CreateSectionInput, UpdateSectionInput } from '@taskflow/contract';
import {
  broadcastSectionCreated,
  broadcastSectionUpdated,
  broadcastSectionDeleted,
  broadcastSectionsReordered,
} from './syncService.js';
import { assertVersion, createOnce } from './versioning.js';
import { saveSectionSettings, sectionSettingsInclude, withSectionSettings } from './userSettings.js';

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

  const sections = await prisma.section.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
    include: sectionInclude(userId),
  });
  return sections.map((section) => withSectionSettings(section));
}

function sectionInclude(userId: string) {
  return {
    ...sectionSettingsInclude(userId),
    _count: {
      select: { tasks: { where: { isCompleted: false, deletedAt: null } } },
    },
  };
}

export async function createSection(data: CreateSectionInput, userId: string) {
  await requireProjectAccess(data.projectId, userId, 'EDIT');

  // Get max sortOrder
  const maxSort = await prisma.section.aggregate({
    where: { projectId: data.projectId },
    _max: { sortOrder: true },
  });

  const { row: section, created } = await createOnce(
    data.id,
    () => prisma.section.findUnique({ where: { id: data.id }, include: sectionInclude(userId) }),
    (row) => row.projectId === data.projectId,
    () =>
      prisma.section.create({
    data: {
      ...(data.id && { id: data.id }),
      name: data.name,
      projectId: data.projectId,
      sortOrder: data.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
    },
    include: sectionInclude(userId),
  }),
  );

  const result = withSectionSettings(section);
  if (created) broadcastSectionCreated(result);

  return result;
}

export async function updateSection(
  id: string,
  data: UpdateSectionInput,
  userId: string,
) {
  // Collapsing is the caller's own view of the section; renaming or moving
  // it changes it for everyone.
  const { isCollapsed, ifVersion, ...shared } = data;
  const changesShared = Object.values(shared).some((v) => v !== undefined);
  await requireSectionAccess(id, userId, changesShared ? 'EDIT' : 'VIEW');

  if (isCollapsed !== undefined) await saveSectionSettings(userId, id, { isCollapsed });
  if (!changesShared) {
    return withSectionSettings(
      await prisma.section.findUniqueOrThrow({ where: { id }, include: sectionInclude(userId) }),
    );
  }

  const section = withSectionSettings(
    await prisma.$transaction(async (tx) => {
      await assertVersion(tx, 'sections', id, ifVersion, async () =>
        withSectionSettings(await tx.section.findUniqueOrThrow({ where: { id }, include: sectionInclude(userId) })),
      );
      return tx.section.update({ where: { id }, data: shared, include: sectionInclude(userId) });
    }),
  );
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
  for (const projectId of new Set(sections.map((s) => s.projectId))) broadcastSectionsReordered(projectId);

  return { message: 'Sections reordered successfully' };
}
