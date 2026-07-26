import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../errors/index.js';
import {
  requireProjectAccess,
  requireWorkspaceRole,
  projectAccessWhere,
} from './access.js';
import type { CreateProjectInput, UpdateProjectInput } from '../schemas/project.js';
import { logActivity } from './activityService.js';
import {
  broadcastProjectUpdated,
  broadcastProjectDeleted,
} from './syncService.js';

export async function getUserProjects(userId: string) {
  const projects = await prisma.project.findMany({
    where: projectAccessWhere(userId),
    include: {
      sections: {
        orderBy: { sortOrder: 'asc' },
      },
      _count: {
        select: {
          tasks: { where: { isCompleted: false } },
        },
      },
      children: {
        select: { id: true },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  return projects;
}

export async function getProjectById(id: string, userId: string) {
  await requireProjectAccess(id, userId, 'VIEW');

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: {
          _count: {
            select: { tasks: { where: { isCompleted: false } } },
          },
        },
      },
      _count: {
        select: {
          tasks: { where: { isCompleted: false } },
        },
      },
      children: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, color: true },
      },
    },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  return project;
}

export async function createProject(data: CreateProjectInput, userId: string) {
  // If parentId provided, verify access to parent
  if (data.parentId) {
    await requireProjectAccess(data.parentId, userId, 'EDIT');
  }

  // If a workspace is targeted, the caller must be at least a MEMBER of it —
  // GUESTs may comment on existing projects but not create new ones, and
  // non-members could otherwise inject projects into foreign workspaces.
  if (data.workspaceId) {
    await requireWorkspaceRole(data.workspaceId, userId, 'MEMBER');
  }

  // Get max sortOrder for user's projects
  const maxSort = await prisma.project.aggregate({
    where: { ownerId: userId, parentId: data.parentId ?? null },
    _max: { sortOrder: true },
  });

  const project = await prisma.project.create({
    data: {
      name: data.name,
      color: data.color ?? '#3B82F6',
      ownerId: userId,
      workspaceId: data.workspaceId,
      parentId: data.parentId,
      viewStyle: data.viewStyle ?? 'LIST',
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
    include: {
      sections: true,
      _count: {
        select: { tasks: { where: { isCompleted: false } } },
      },
      children: {
        select: { id: true },
      },
    },
  });

  logActivity({
    action: 'CREATED',
    entityType: 'PROJECT',
    entityId: project.id,
    userId,
    newData: { name: data.name },
  }).catch(console.error);

  broadcastProjectUpdated(project);

  return project;
}

export async function updateProject(
  id: string,
  data: UpdateProjectInput,
  userId: string,
) {
  const oldProject = await requireProjectAccess(id, userId, 'ADMIN');

  const project = await prisma.project.update({
    where: { id },
    data,
    include: {
      sections: {
        orderBy: { sortOrder: 'asc' },
      },
      _count: {
        select: { tasks: { where: { isCompleted: false } } },
      },
      children: {
        select: { id: true },
      },
    },
  });

  logActivity({
    action: 'UPDATED',
    entityType: 'PROJECT',
    entityId: id,
    userId,
    oldData: { id: oldProject.id },
    newData: data as Record<string, unknown>,
  }).catch(console.error);

  broadcastProjectUpdated(project);

  return project;
}

export async function deleteProject(id: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, ownerId: true, isInbox: true, name: true, workspaceId: true },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }
  await requireProjectAccess(id, userId, 'ADMIN');
  if (project.isInbox) {
    throw new ForbiddenError('Cannot delete the Inbox project');
  }

  await prisma.project.delete({ where: { id } });

  logActivity({
    action: 'DELETED',
    entityType: 'PROJECT',
    entityId: id,
    userId,
    oldData: { name: project.name },
  }).catch(console.error);

  broadcastProjectDeleted(id, project.workspaceId);

  return { message: 'Project deleted successfully' };
}

export async function archiveProject(id: string, userId: string) {
  await requireProjectAccess(id, userId, 'ADMIN');

  const project = await prisma.project.update({
    where: { id },
    data: { isArchived: true },
  });

  logActivity({
    action: 'ARCHIVED',
    entityType: 'PROJECT',
    entityId: id,
    userId,
    newData: { name: project.name },
  }).catch(console.error);

  broadcastProjectUpdated(project);

  return project;
}

export async function unarchiveProject(id: string, userId: string) {
  await requireProjectAccess(id, userId, 'ADMIN');

  const project = await prisma.project.update({
    where: { id },
    data: { isArchived: false },
  });

  logActivity({
    action: 'UNARCHIVED',
    entityType: 'PROJECT',
    entityId: id,
    userId,
    newData: { name: project.name },
  }).catch(console.error);

  broadcastProjectUpdated(project);

  return project;
}

export async function getProjectMembers(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      ownerId: true,
      workspaceId: true,
      owner: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      },
    },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // For workspace projects, return workspace members
  if (project.workspaceId) {
    const wsMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: project.workspaceId, userId },
      },
    });
    if (!wsMember) {
      throw new ForbiddenError('You do not have access to this project');
    }

    const wsMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId: project.workspaceId },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });
    return wsMembers.map((m) => m.user);
  }

  // For personal/shared projects, verify access and return project members
  const hasAccess =
    project.ownerId === userId ||
    project.members.some((m) => m.userId === userId);
  if (!hasAccess) {
    throw new ForbiddenError('You do not have access to this project');
  }

  // Build list: owner + members, deduplicated
  const usersMap = new Map<string, { id: string; name: string; email: string; avatarUrl: string | null }>();
  if (project.owner) {
    usersMap.set(project.owner.id, project.owner);
  }
  for (const m of project.members) {
    usersMap.set(m.user.id, m.user);
  }

  return Array.from(usersMap.values());
}

export async function duplicateProject(
  id: string,
  userId: string,
  newName?: string,
) {
  const original = await prisma.project.findUnique({
    where: { id },
    include: {
      sections: { orderBy: { sortOrder: 'asc' } },
      tasks: {
        where: { parentId: null },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!original) {
    throw new NotFoundError('Project not found');
  }
  await requireProjectAccess(id, userId, 'VIEW');
  if (original.workspaceId) {
    await requireWorkspaceRole(original.workspaceId, userId, 'MEMBER');
  }

  // Create the duplicate project
  const duplicate = await prisma.project.create({
    data: {
      name: newName ?? `${original.name} (copy)`,
      color: original.color,
      ownerId: userId,
      workspaceId: original.workspaceId,
      parentId: original.parentId,
      viewStyle: original.viewStyle,
    },
  });

  // Duplicate sections
  const sectionMap = new Map<string, string>();
  for (const section of original.sections) {
    const newSection = await prisma.section.create({
      data: {
        name: section.name,
        projectId: duplicate.id,
        sortOrder: section.sortOrder,
      },
    });
    sectionMap.set(section.id, newSection.id);
  }

  // Duplicate tasks
  for (const task of original.tasks) {
    await prisma.task.create({
      data: {
        content: task.content,
        description: task.description,
        projectId: duplicate.id,
        sectionId: task.sectionId ? sectionMap.get(task.sectionId) : null,
        creatorId: userId,
        priority: task.priority,
        sortOrder: task.sortOrder,
      },
    });
  }

  return prisma.project.findUnique({
    where: { id: duplicate.id },
    include: {
      sections: { orderBy: { sortOrder: 'asc' } },
      _count: {
        select: { tasks: { where: { isCompleted: false } } },
      },
      children: { select: { id: true } },
    },
  });
}

export async function reorderProjects(projectIds: string[], userId: string) {
  // Verify all projects belong to the user
  const projects = await prisma.project.findMany({
    where: {
      id: { in: projectIds },
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } },
      ],
    },
    select: { id: true },
  });

  if (projects.length !== projectIds.length) {
    throw new ForbiddenError('You do not have access to all specified projects');
  }

  // Update sortOrder for each project
  const updates = projectIds.map((id, index) =>
    prisma.project.update({
      where: { id },
      data: { sortOrder: index },
    }),
  );

  await prisma.$transaction(updates);

  return { message: 'Projects reordered successfully' };
}
