import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../errors/index.js';
import type { CreateSectionInput, UpdateSectionInput } from '../schemas/section.js';

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

async function verifySectionAccess(sectionId: string, userId: string) {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { project: { select: { ownerId: true } } },
  });
  if (!section) {
    throw new NotFoundError('Section not found');
  }
  if (section.project.ownerId !== userId) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: section.projectId, userId } },
    });
    if (!member) {
      throw new ForbiddenError('You do not have access to this section');
    }
  }
  return section;
}

export async function getProjectSections(projectId: string, userId: string) {
  await verifyProjectAccess(projectId, userId);

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
  await verifyProjectAccess(data.projectId, userId);

  // Get max sortOrder
  const maxSort = await prisma.section.aggregate({
    where: { projectId: data.projectId },
    _max: { sortOrder: true },
  });

  return prisma.section.create({
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
}

export async function updateSection(
  id: string,
  data: UpdateSectionInput,
  userId: string,
) {
  await verifySectionAccess(id, userId);

  return prisma.section.update({
    where: { id },
    data,
    include: {
      _count: {
        select: { tasks: { where: { isCompleted: false } } },
      },
    },
  });
}

export async function deleteSection(id: string, userId: string) {
  await verifySectionAccess(id, userId);

  // Move tasks to no section
  await prisma.task.updateMany({
    where: { sectionId: id },
    data: { sectionId: null },
  });

  await prisma.section.delete({ where: { id } });

  return { message: 'Section deleted successfully' };
}

export async function reorderSections(sectionIds: string[], userId: string) {
  if (sectionIds.length === 0) return { message: 'Nothing to reorder' };

  // Verify all sections exist and belong to a project the user has access to
  const sections = await prisma.section.findMany({
    where: { id: { in: sectionIds } },
    include: { project: { select: { ownerId: true } } },
  });

  if (sections.length !== sectionIds.length) {
    throw new NotFoundError('One or more sections not found');
  }

  for (const section of sections) {
    if (section.project.ownerId !== userId) {
      const member = await prisma.projectMember.findUnique({
        where: {
          projectId_userId: { projectId: section.projectId, userId },
        },
      });
      if (!member) {
        throw new ForbiddenError('You do not have access to reorder these sections');
      }
    }
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
