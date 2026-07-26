import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../errors/index.js';
import {
  requireProjectAccess,
  requireWorkspaceRole,
  projectAccessWhere,
} from './access.js';
import type { CreateProjectInput, UpdateProjectInput } from '../schemas/project.js';
import { logActivity } from './activityService.js';
import { reclaimAttachments } from './fileService.js';
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

  // Collect attachments across the project's tasks before the cascade
  // orphans their rows, so their storage bytes can be reclaimed.
  const attachments = await prisma.attachment.findMany({
    where: { task: { projectId: id } },
    select: { id: true, url: true },
  });

  await prisma.project.delete({ where: { id } });

  reclaimAttachments(attachments).catch((err) =>
    console.error('[projectService] attachment reclaim failed:', err),
  );

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
    // GUESTs get names and avatars, not the whole team's email addresses.
    if (wsMember.role === 'GUEST') {
      return wsMembers.map((m) => ({ ...m.user, email: null }));
    }
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

  // Everything the copy needs: incomplete top-level tasks with their labels
  // and subtasks. (The old loop-of-creates was N+1 round trips with no
  // transaction — a mid-copy failure left a permanently half-populated
  // project — and silently dropped subtasks, labels, dates and assignees.)
  const sourceTasks = await prisma.task.findMany({
    where: { projectId: id, parentId: null },
    orderBy: { sortOrder: 'asc' },
    include: {
      taskLabels: { select: { labelId: true, label: { select: { userId: true } } } },
      subtasks: {
        orderBy: { sortOrder: 'asc' },
        include: { taskLabels: { select: { labelId: true, label: { select: { userId: true } } } } },
      },
    },
  });

  const duplicate = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        name: newName ?? `${original.name} (copy)`,
        color: original.color,
        description: original.description,
        ownerId: userId,
        workspaceId: original.workspaceId,
        parentId: original.parentId,
        viewStyle: original.viewStyle,
      },
    });

    const sectionMap = new Map<string, string>();
    for (const section of original.sections) {
      const newSection = await tx.section.create({
        data: {
          name: section.name,
          projectId: created.id,
          sortOrder: section.sortOrder,
        },
      });
      sectionMap.set(section.id, newSection.id);
    }

    // Labels are per-user: only the duplicating user's own labels carry over.
    const ownLabelIds = (labels: Array<{ labelId: string; label: { userId: string } }>) =>
      labels.filter((l) => l.label.userId === userId).map((l) => ({ labelId: l.labelId }));

    for (const task of sourceTasks) {
      const parentLabels = ownLabelIds(task.taskLabels);
      const newTask = await tx.task.create({
        data: {
          content: task.content,
          description: task.description,
          projectId: created.id,
          sectionId: task.sectionId ? sectionMap.get(task.sectionId) : null,
          creatorId: userId,
          assigneeId: task.assigneeId,
          dueDate: task.dueDate,
          dueTime: task.dueTime,
          deadline: task.deadline,
          duration: task.duration,
          priority: task.priority,
          isRecurring: task.isRecurring,
          recurrenceRule: task.recurrenceRule,
          sortOrder: task.sortOrder,
          taskLabels: parentLabels.length ? { create: parentLabels } : undefined,
        },
      });

      if (task.subtasks.length > 0) {
        for (const sub of task.subtasks) {
          const subLabels = ownLabelIds(sub.taskLabels);
          await tx.task.create({
            data: {
              content: sub.content,
              description: sub.description,
              projectId: created.id,
              parentId: newTask.id,
              creatorId: userId,
              assigneeId: sub.assigneeId,
              dueDate: sub.dueDate,
              dueTime: sub.dueTime,
              priority: sub.priority,
              sortOrder: sub.sortOrder,
              taskLabels: subLabels.length ? { create: subLabels } : undefined,
            },
          });
        }
      }
    }

    return created;
  }, { timeout: 30_000 });

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
