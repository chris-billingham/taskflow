import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors/index.js';
import {
  hasProjectAccess,
  requireProjectAccess,
  requireWorkspaceRole,
  projectAccessWhere,
  effectiveProjectLevels,
  levelSatisfies,
} from './access.js';
import type { CreateProjectInput, UpdateProjectInput } from '@taskflow/contract';
import { logActivity } from './activityService.js';
import { reclaimAttachments } from './fileService.js';
import {
  broadcastProjectUpdated,
  broadcastProjectDeleted,
} from './syncService.js';
import { logFailure } from '../config/logger.js';
import { remapTaskLabels, scopeOfProject } from './labelScope.js';
import { assertVersion, createOnce } from './versioning.js';
import {
  projectSettingsInclude,
  sectionSettingsInclude,
  saveProjectSettings,
  withProjectSettings,
} from './userSettings.js';

export async function getUserProjects(userId: string) {
  const projects = await prisma.project.findMany({
    where: projectAccessWhere(userId),
    include: {
      ...projectSettingsInclude(userId),
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: sectionSettingsInclude(userId),
      },
      _count: {
        select: {
          tasks: { where: { isCompleted: false, deletedAt: null } },
        },
      },
      children: {
        select: { id: true },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  return projects.map((project) => withProjectSettings(project));
}

export async function getProjectById(id: string, userId: string) {
  await requireProjectAccess(id, userId, 'VIEW');

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      ...projectSettingsInclude(userId),
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: {
          ...sectionSettingsInclude(userId),
          _count: {
            select: { tasks: { where: { isCompleted: false, deletedAt: null } } },
          },
        },
      },
      _count: {
        select: {
          tasks: { where: { isCompleted: false, deletedAt: null } },
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

  return withProjectSettings(project);
}

/**
 * A parent must be a project you can edit, in the same workspace (or both
 * personal), never the Inbox, and never the project itself or one of its own
 * descendants (that would make a loop the sidebar can't draw).
 */
async function assertValidParent(
  parentId: string,
  userId: string,
  child: { id?: string; workspaceId: string | null },
) {
  const parent = await requireProjectAccess(parentId, userId, 'EDIT');
  if (parent.isInbox) throw new ValidationError('Projects cannot be nested under the Inbox');
  if ((parent.workspaceId ?? null) !== (child.workspaceId ?? null)) {
    throw new ValidationError('A project can only be nested under a project in the same workspace');
  }
  if (!child.id) return;
  let cursor: string | null = parent.id;
  for (let depth = 0; cursor && depth < 100; depth++) {
    if (cursor === child.id) throw new ValidationError('A project cannot be nested under itself or its sub-projects');
    const next: { parentId: string | null } | null = await prisma.project.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = next?.parentId ?? null;
  }
}

export async function createProject(data: CreateProjectInput, userId: string) {
  if (data.parentId) {
    await assertValidParent(data.parentId, userId, { workspaceId: data.workspaceId ?? null });
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

  const createInclude = {
    ...projectSettingsInclude(userId),
    sections: { include: sectionSettingsInclude(userId) },
    _count: {
      select: { tasks: { where: { isCompleted: false, deletedAt: null } } },
    },
    children: {
      select: { id: true },
    },
  };
  const { row: project, created } = await createOnce(
    data.id,
    () => prisma.project.findUnique({ where: { id: data.id }, include: createInclude }),
    (row) => row.ownerId === userId,
    () =>
      prisma.project.create({
    data: {
      ...(data.id && { id: data.id }),
      name: data.name,
      color: data.color ?? '#3B82F6',
      ownerId: userId,
      workspaceId: data.workspaceId,
      parentId: data.parentId,
      description: data.description,
      viewStyle: data.viewStyle ?? 'LIST',
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
    include: createInclude,
  }),
  );
  if (!created) return withProjectSettings(project);

  logActivity({
    action: 'CREATED',
    entityType: 'PROJECT',
    entityId: project.id,
    userId,
    newData: { name: data.name },
  }).catch(logFailure('activity log failed'));

  broadcastProjectUpdated(project);

  return withProjectSettings(project);
}

export async function updateProject(
  id: string,
  data: UpdateProjectInput,
  userId: string,
) {
  // Favourite and order are the caller's own arrangement: anyone who can see
  // the project may change them. Everything else changes it for everyone.
  const { isFavorite, sortOrder, ifVersion, ...shared } = data;
  const changesShared = Object.values(shared).some((v) => v !== undefined);

  const oldProject = await requireProjectAccess(id, userId, changesShared ? 'ADMIN' : 'VIEW');
  if (shared.parentId !== undefined && shared.parentId !== oldProject.parentId) {
    if (oldProject.isInbox) throw new ValidationError('The Inbox cannot be nested');
    if (shared.parentId) await assertValidParent(shared.parentId, userId, oldProject);
  }

  if (isFavorite !== undefined || sortOrder !== undefined) {
    await saveProjectSettings(userId, id, { isFavorite, sortOrder });
  }

  const include = {
    ...projectSettingsInclude(userId),
    sections: {
      orderBy: { sortOrder: 'asc' as const },
      include: sectionSettingsInclude(userId),
    },
    _count: {
      select: { tasks: { where: { isCompleted: false, deletedAt: null } } },
    },
    children: {
      select: { id: true },
    },
  };
  if (!changesShared) {
    return withProjectSettings(await prisma.project.findUniqueOrThrow({ where: { id }, include }));
  }

  const project = await prisma.$transaction(async (tx) => {
    await assertVersion(tx, 'projects', id, ifVersion, async () =>
      withProjectSettings(await tx.project.findUniqueOrThrow({ where: { id }, include })),
    );
    return tx.project.update({ where: { id }, data: shared, include });
  });

  logActivity({
    action: 'UPDATED',
    entityType: 'PROJECT',
    entityId: id,
    userId,
    oldData: { id: oldProject.id },
    newData: shared as Record<string, unknown>,
  }).catch(logFailure('activity log failed'));

  broadcastProjectUpdated(project);

  return withProjectSettings(project);
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

  reclaimAttachments(attachments).catch(logFailure('attachment reclaim failed', { projectId: id }));

  logActivity({
    action: 'DELETED',
    entityType: 'PROJECT',
    entityId: id,
    userId,
    oldData: { name: project.name },
  }).catch(logFailure('activity log failed'));

  broadcastProjectDeleted(id, project.workspaceId);

  return { message: 'Project deleted successfully' };
}

export async function archiveProject(id: string, userId: string) {
  await requireProjectAccess(id, userId, 'ADMIN');

  const project = await prisma.project.update({
    where: { id },
    data: { isArchived: true },
    include: projectSettingsInclude(userId),
  });

  logActivity({
    action: 'ARCHIVED',
    entityType: 'PROJECT',
    entityId: id,
    userId,
    newData: { name: project.name },
  }).catch(logFailure('activity log failed'));

  broadcastProjectUpdated(project);

  return withProjectSettings(project);
}

export async function unarchiveProject(id: string, userId: string) {
  await requireProjectAccess(id, userId, 'ADMIN');

  const project = await prisma.project.update({
    where: { id },
    data: { isArchived: false },
    include: projectSettingsInclude(userId),
  });

  logActivity({
    action: 'UNARCHIVED',
    entityType: 'PROJECT',
    entityId: id,
    userId,
    newData: { name: project.name },
  }).catch(logFailure('activity log failed'));

  broadcastProjectUpdated(project);

  return withProjectSettings(project);
}

/**
 * The people who can see a project, for assigning and @mentions: its owner,
 * the people it's shared with, and its workspace's members except guests.
 */
export async function getProjectMembers(projectId: string, userId: string) {
  await requireProjectAccess(projectId, userId, 'VIEW');
  const person = { select: { id: true, name: true, email: true, avatarUrl: true } } as const;
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      owner: person,
      members: { select: { user: person } },
      workspace: {
        select: { members: { where: { role: { not: 'GUEST' } }, select: { user: person } } },
      },
    },
  });

  const people = new Map<string, { id: string; name: string; email: string; avatarUrl: string | null }>();
  if (project.owner) people.set(project.owner.id, project.owner);
  for (const m of project.workspace?.members ?? []) people.set(m.user.id, m.user);
  for (const m of project.members) people.set(m.user.id, m.user);

  // People who may only comment or view get names and avatars, not the
  // team's email addresses.
  const canSeeEmails = await hasProjectAccess(projectId, userId, 'EDIT');
  const list = [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
  return canSeeEmails ? list : list.map((p) => ({ ...p, email: null }));
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
        where: { parentId: null, deletedAt: null },
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
        where: { deletedAt: null },
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

    // Every label carries over; if the copy is in another space (you
    // duplicated someone else's shared project into your own), they're
    // mapped there by name at the end.
    const ownLabelIds = (labels: Array<{ labelId: string }>) => labels.map((l) => ({ labelId: l.labelId }));
    const newTaskIds: string[] = [];

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
      newTaskIds.push(newTask.id);

      if (task.subtasks.length > 0) {
        for (const sub of task.subtasks) {
          const subLabels = ownLabelIds(sub.taskLabels);
          const newSub = await tx.task.create({
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
          newTaskIds.push(newSub.id);
        }
      }
    }

    await remapTaskLabels(newTaskIds, scopeOfProject(created), tx);
    return created;
  }, { timeout: 30_000 });

  const copy = await prisma.project.findUniqueOrThrow({
    where: { id: duplicate.id },
    include: {
      ...projectSettingsInclude(userId),
      sections: { orderBy: { sortOrder: 'asc' }, include: sectionSettingsInclude(userId) },
      _count: {
        select: { tasks: { where: { isCompleted: false, deletedAt: null } } },
      },
      children: { select: { id: true } },
    },
  });
  return withProjectSettings(copy);
}

export async function reorderProjects(projectIds: string[], userId: string) {
  // The order is the caller's own, so seeing each project is enough.
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, ownerId: true, workspaceId: true },
  });
  const levels = await effectiveProjectLevels(projects, userId);

  if (
    projects.length !== new Set(projectIds).size ||
    !projects.every((p) => levelSatisfies(levels.get(p.id), 'VIEW'))
  ) {
    throw new ForbiddenError('You do not have access to all specified projects');
  }

  await prisma.$transaction(
    projectIds.map((projectId, index) =>
      prisma.projectUserSetting.upsert({
        where: { userId_projectId: { userId, projectId } },
        create: { userId, projectId, sortOrder: index },
        update: { sortOrder: index },
      }),
    ),
  );

  return { message: 'Projects reordered successfully' };
}
