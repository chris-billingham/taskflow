import { prisma } from '../config/database.js';
import type { Prisma } from '@prisma/client';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors/index.js';
import { getRequestId } from '../utils/requestContext.js';
import type {
  CreateTaskInput,
  UpdateTaskInput,
  TaskQuery,
  BulkTaskInput,
  MoveTaskInput,
} from '../schemas/task.js';
import { parseQuickAdd } from '../utils/quickAddParser.js';
import { getNextOccurrence } from '../utils/recurrence.js';
import { logActivity } from './activityService.js';
import {
  broadcastTaskCreated,
  broadcastTaskUpdated,
  broadcastTaskDeleted,
} from './syncService.js';

// Runs a post-mutation side effect (logging, broadcast) without blocking the
// response. Errors are caught and warned so they don't silently swallow.
function runSideEffect(label: string, fn: () => Promise<unknown> | unknown) {
  const reqId = getRequestId();
  const tag = reqId ? `[taskService reqId=${reqId}]` : '[taskService]';
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.catch((err) => console.warn(`${tag} ${label} failed:`, err));
    }
  } catch (err) {
    console.warn(`${tag} ${label} failed:`, err);
  }
}

// Full include used on single-task detail endpoints (includes subtasks)
export const taskInclude = {
  taskLabels: {
    include: { label: true },
  },
  assignee: {
    select: { id: true, name: true, email: true, avatarUrl: true },
  },
  subtasks: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      taskLabels: { include: { label: true } },
      assignee: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
    },
  },
  _count: {
    select: { subtasks: true, comments: true },
  },
};

// Lean include used on list endpoints — omits subtask bodies to keep responses small
const taskListInclude = {
  taskLabels: {
    include: { label: true },
  },
  assignee: {
    select: { id: true, name: true, email: true, avatarUrl: true },
  },
  _count: {
    select: { subtasks: true, comments: true },
  },
};

async function verifyTaskAccess(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { ownerId: true, workspaceId: true } } },
  });
  if (!task) {
    throw new NotFoundError('Task not found');
  }
  if (task.project.ownerId !== userId && task.creatorId !== userId) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: task.projectId, userId } },
    });
    if (!member) {
      // Check workspace membership for team projects
      if (task.project.workspaceId) {
        const wsMember = await prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: task.project.workspaceId,
              userId,
            },
          },
        });
        if (wsMember) return task;
      }
      throw new ForbiddenError('You do not have access to this task');
    }
  }
  return task;
}

// Labels are per-user (Label.userId). Reject label ids that don't exist or
// belong to another user — otherwise a caller could attach (and, via the task
// response, read) another user's labels, or hit an opaque 500 on an FK error.
async function assertLabelsOwned(labelIds: string[], userId: string) {
  const unique = [...new Set(labelIds)];
  if (unique.length === 0) return;
  const count = await prisma.label.count({
    where: { id: { in: unique }, userId },
  });
  if (count !== unique.length) {
    throw new ValidationError('One or more labels do not exist or are not yours');
  }
}

async function verifyProjectAccess(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true, workspaceId: true },
  });
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  if (project.ownerId !== userId) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) {
      // Check workspace membership for team projects
      if (project.workspaceId) {
        const wsMember = await prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: { workspaceId: project.workspaceId, userId },
          },
        });
        if (wsMember) return project;
      }
      throw new ForbiddenError('You do not have access to this project');
    }
  }
  return project;
}

type TaskWithProject = {
  id: string;
  projectId: string;
  creatorId: string;
  project: { ownerId: string | null; workspaceId: string | null };
};

async function verifyBulkTaskAccess(tasks: TaskWithProject[], userId: string) {
  // Collect project IDs where the user is not owner/creator to batch-check membership
  const projectIdsToCheck = [
    ...new Set(
      tasks
        .filter((t) => t.project.ownerId !== userId && t.creatorId !== userId)
        .map((t) => t.projectId),
    ),
  ];
  if (projectIdsToCheck.length === 0) return;

  const [projectMembers, workspaceIds] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId: { in: projectIdsToCheck }, userId },
      select: { projectId: true },
    }),
    Promise.resolve(
      [
        ...new Set(
          tasks
            .filter((t) => t.project.workspaceId !== null)
            .map((t) => t.project.workspaceId as string),
        ),
      ],
    ),
  ]);

  const memberProjectIds = new Set(projectMembers.map((m) => m.projectId));

  const wsMembers = workspaceIds.length > 0
    ? await prisma.workspaceMember.findMany({
        where: { workspaceId: { in: workspaceIds }, userId },
        select: { workspaceId: true },
      })
    : [];
  const memberWorkspaceIds = new Set(wsMembers.map((m) => m.workspaceId));

  for (const task of tasks) {
    if ((task.project.ownerId && task.project.ownerId === userId) || task.creatorId === userId) continue;
    if (memberProjectIds.has(task.projectId)) continue;
    if (task.project.workspaceId && memberWorkspaceIds.has(task.project.workspaceId)) continue;
    throw new ForbiddenError('You do not have access to all specified tasks');
  }
}

export async function getTasks(query: TaskQuery, userId: string) {
  // Get workspace IDs the user belongs to
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((m) => m.workspaceId);

  const where: Prisma.TaskWhereInput = {
    project: {
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } },
        ...(workspaceIds.length > 0
          ? [{ workspaceId: { in: workspaceIds } }]
          : []),
      ],
    },
    projectId: query.projectId,
    sectionId: query.sectionId,
    parentId: query.parentId ?? null,
    ...(query.completed !== undefined && { isCompleted: query.completed === 'true' }),
    ...(query.assigneeId && { assigneeId: query.assigneeId }),
    ...(query.priority && { priority: { in: query.priority.split(',').map(Number) } }),
    ...(query.labels && { taskLabels: { some: { labelId: { in: query.labels.split(',') } } } }),
    ...(query.search && { content: { contains: query.search, mode: 'insensitive' } }),
    ...((query.dueDateFrom || query.dueDateTo) && {
      dueDate: {
        ...(query.dueDateFrom && { gte: new Date(query.dueDateFrom) }),
        ...(query.dueDateTo && { lte: new Date(query.dueDateTo) }),
      },
    }),
  };

  const tasks = await prisma.task.findMany({
    where,
    include: taskListInclude,
    orderBy: { sortOrder: 'asc' },
  });

  return tasks;
}

export async function getTaskById(id: string, userId: string) {
  await verifyTaskAccess(id, userId);

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      ...taskInclude,
      project: {
        select: { id: true, name: true, color: true },
      },
      section: {
        select: { id: true, name: true },
      },
      parent: {
        select: { id: true, content: true },
      },
      comments: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          author: {
            select: { id: true, name: true, avatarUrl: true },
          },
        },
      },
    },
  });

  if (!task) {
    throw new NotFoundError('Task not found');
  }

  return task;
}

export async function createTask(data: CreateTaskInput, userId: string) {
  await verifyProjectAccess(data.projectId, userId);
  if (data.labelIds?.length) {
    await assertLabelsOwned(data.labelIds, userId);
  }

  // Get max sortOrder
  const maxSort = await prisma.task.aggregate({
    where: {
      projectId: data.projectId,
      sectionId: data.sectionId ?? null,
      parentId: data.parentId ?? null,
    },
    _max: { sortOrder: true },
  });

  const task = await prisma.task.create({
    data: {
      content: data.content,
      description: data.description,
      projectId: data.projectId,
      sectionId: data.sectionId,
      parentId: data.parentId,
      creatorId: userId,
      assigneeId: data.assigneeId,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      dueTime: data.dueTime,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      duration: data.duration,
      priority: data.priority ?? 4,
      isRecurring: data.isRecurring ?? false,
      recurrenceRule: data.recurrenceRule,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      taskLabels: data.labelIds?.length
        ? {
            create: data.labelIds.map((labelId) => ({ labelId })),
          }
        : undefined,
    },
    include: taskInclude,
  });

  runSideEffect('logActivity:CREATED', () => logActivity({
    action: 'CREATED',
    entityType: 'TASK',
    entityId: task.id,
    userId,
    taskId: task.id,
    newData: { content: data.content, projectId: data.projectId },
  }));
  runSideEffect('broadcastTaskCreated', () => broadcastTaskCreated(task));

  return task;
}

export async function updateTask(
  id: string,
  data: UpdateTaskInput,
  userId: string,
) {
  const oldTask = await verifyTaskAccess(id, userId);

  const { labelIds, ...updateData } = data;

  if (labelIds !== undefined && labelIds.length > 0) {
    await assertLabelsOwned(labelIds, userId);
  }

  // Prepare date fields
  const prismaData: Prisma.TaskUpdateInput = {
    ...updateData,
    ...(updateData.dueDate !== undefined && {
      dueDate: updateData.dueDate ? new Date(updateData.dueDate) : null,
    }),
    ...(updateData.deadline !== undefined && {
      deadline: updateData.deadline ? new Date(updateData.deadline) : null,
    }),
  };

  // Replace labels and update the task in one transaction so a failure can't
  // leave the task with its labels wiped and nothing put back.
  const task = await prisma.$transaction(async (tx) => {
    if (labelIds !== undefined) {
      await tx.taskLabel.deleteMany({ where: { taskId: id } });
      if (labelIds.length > 0) {
        await tx.taskLabel.createMany({
          data: labelIds.map((labelId) => ({ taskId: id, labelId })),
        });
      }
    }
    return tx.task.update({
      where: { id },
      data: prismaData,
      include: taskInclude,
    });
  });

  runSideEffect('logActivity:UPDATED', () => logActivity({
    action: 'UPDATED',
    entityType: 'TASK',
    entityId: id,
    userId,
    taskId: id,
    oldData: { content: oldTask.content, priority: oldTask.priority, dueDate: oldTask.dueDate?.toISOString() ?? null },
    newData: data as Record<string, unknown>,
  }));
  runSideEffect('broadcastTaskUpdated', () => broadcastTaskUpdated(task));

  return task;
}

export async function deleteTask(id: string, userId: string) {
  const task = await verifyTaskAccess(id, userId);

  // Cascade delete handles subtasks via Prisma schema
  await prisma.task.delete({ where: { id } });

  runSideEffect('logActivity:DELETED', () => logActivity({
    action: 'DELETED',
    entityType: 'TASK',
    entityId: id,
    userId,
    oldData: { content: task.content, projectId: task.projectId },
  }));
  runSideEffect('broadcastTaskDeleted', () => broadcastTaskDeleted(id, task.projectId));

  return { message: 'Task deleted successfully' };
}

export async function completeTask(id: string, userId: string) {
  const task = await verifyTaskAccess(id, userId);

  // Idempotency guard: a double-click or concurrent request must not re-run the
  // completion logic (which, for recurring tasks, spawns the next occurrence).
  if (task.isCompleted) {
    return prisma.task.findUniqueOrThrow({ where: { id }, include: taskInclude });
  }

  if (task.isRecurring && task.recurrenceRule) {
    const fromDate = task.dueDate || new Date();
    const nextDate = getNextOccurrence(task.recurrenceRule, fromDate);

    const { completedTask, newTask } = await prisma.$transaction(async (tx) => {
      // Atomically claim the completion. If a concurrent request already flipped
      // isCompleted, count === 0 and we skip creating a duplicate next occurrence.
      const claim = await tx.task.updateMany({
        where: { id, isCompleted: false },
        data: { isCompleted: true, completedAt: new Date() },
      });
      if (claim.count === 0) {
        const current = await tx.task.findUniqueOrThrow({ where: { id }, include: taskInclude });
        return { completedTask: current, newTask: null };
      }

      // Carry the labels over to the next occurrence.
      const labels = await tx.taskLabel.findMany({
        where: { taskId: id },
        select: { labelId: true },
      });

      const created = await tx.task.create({
        data: {
          content: task.content,
          description: task.description,
          projectId: task.projectId,
          sectionId: task.sectionId,
          parentId: task.parentId,
          creatorId: task.creatorId,
          assigneeId: task.assigneeId,
          dueDate: nextDate,
          dueTime: task.dueTime,
          deadline: task.deadline,
          duration: task.duration,
          priority: task.priority,
          isRecurring: true,
          recurrenceRule: task.recurrenceRule,
          sortOrder: task.sortOrder,
          taskLabels: labels.length
            ? { create: labels.map((l) => ({ labelId: l.labelId })) }
            : undefined,
        },
        include: taskInclude,
      });
      const completed = await tx.task.findUniqueOrThrow({ where: { id }, include: taskInclude });
      return { completedTask: completed, newTask: created };
    });

    if (!newTask) {
      // Lost the race — task was already completed by a concurrent request.
      return completedTask;
    }

    runSideEffect('logActivity:COMPLETED', () => logActivity({
      action: 'COMPLETED',
      entityType: 'TASK',
      entityId: id,
      userId,
      taskId: id,
      newData: { content: task.content },
    }));
    runSideEffect('broadcastTaskUpdated', () => broadcastTaskUpdated(completedTask));
    runSideEffect('broadcastTaskCreated', () => broadcastTaskCreated(newTask));

    return newTask;
  }

  // Non-recurring: atomically claim completion so a duplicate request is a no-op.
  const claim = await prisma.task.updateMany({
    where: { id, isCompleted: false },
    data: { isCompleted: true, completedAt: new Date() },
  });
  const updated = await prisma.task.findUniqueOrThrow({ where: { id }, include: taskInclude });

  if (claim.count > 0) {
    runSideEffect('logActivity:COMPLETED', () => logActivity({
      action: 'COMPLETED',
      entityType: 'TASK',
      entityId: id,
      userId,
      taskId: id,
      newData: { content: task.content },
    }));
    runSideEffect('broadcastTaskUpdated', () => broadcastTaskUpdated(updated));
  }

  return updated;
}

export async function uncompleteTask(id: string, userId: string) {
  const oldTask = await verifyTaskAccess(id, userId);

  const task = await prisma.task.update({
    where: { id },
    data: { isCompleted: false, completedAt: null },
    include: taskInclude,
  });

  runSideEffect('logActivity:UNCOMPLETED', () => logActivity({
    action: 'UNCOMPLETED',
    entityType: 'TASK',
    entityId: id,
    userId,
    taskId: id,
    newData: { content: oldTask.content },
  }));
  runSideEffect('broadcastTaskUpdated', () => broadcastTaskUpdated(task));

  return task;
}

export async function moveTask(
  id: string,
  data: MoveTaskInput,
  userId: string,
) {
  const oldTask = await verifyTaskAccess(id, userId);

  if (data.projectId) {
    await verifyProjectAccess(data.projectId, userId);
  }

  const updateData: Prisma.TaskUpdateInput = {
    ...(data.projectId !== undefined && { project: { connect: { id: data.projectId } } }),
    ...(data.sectionId !== undefined && {
      section: data.sectionId ? { connect: { id: data.sectionId } } : { disconnect: true },
    }),
    ...(data.parentId !== undefined && {
      parent: data.parentId ? { connect: { id: data.parentId } } : { disconnect: true },
    }),
  };

  const task = await prisma.task.update({
    where: { id },
    data: updateData,
    include: taskInclude,
  });

  runSideEffect('logActivity:MOVED', () => logActivity({
    action: 'MOVED',
    entityType: 'TASK',
    entityId: id,
    userId,
    taskId: id,
    oldData: { projectId: oldTask.projectId, sectionId: oldTask.sectionId },
    newData: data as Record<string, unknown>,
  }));
  runSideEffect('broadcastTaskUpdated', () => broadcastTaskUpdated(task));

  return task;
}

export async function duplicateTask(id: string, userId: string) {
  const original = await verifyTaskAccess(id, userId);

  const task = await prisma.task.create({
    data: {
      content: original.content,
      description: original.description,
      projectId: original.projectId,
      sectionId: original.sectionId,
      parentId: original.parentId,
      creatorId: userId,
      assigneeId: original.assigneeId,
      dueDate: original.dueDate,
      dueTime: original.dueTime,
      deadline: original.deadline,
      duration: original.duration,
      priority: original.priority,
      isRecurring: original.isRecurring,
      recurrenceRule: original.recurrenceRule,
      sortOrder: original.sortOrder + 1,
    },
    include: taskInclude,
  });

  return task;
}

export async function bulkUpdate(
  data: BulkTaskInput,
  userId: string,
) {
  const { taskIds, action, data: actionData } = data;

  // Verify access to all tasks
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    include: { project: { select: { ownerId: true, workspaceId: true } } },
  });

  if (tasks.length !== taskIds.length) {
    throw new NotFoundError('One or more tasks not found');
  }

  await verifyBulkTaskAccess(tasks, userId);

  switch (action) {
    case 'complete':
      await prisma.task.updateMany({
        where: { id: { in: taskIds } },
        data: { isCompleted: true, completedAt: new Date() },
      });
      break;

    case 'uncomplete':
      await prisma.task.updateMany({
        where: { id: { in: taskIds } },
        data: { isCompleted: false, completedAt: null },
      });
      break;

    case 'delete':
      await prisma.task.deleteMany({
        where: { id: { in: taskIds } },
      });
      break;

    case 'move':
      if (actionData?.projectId) {
        await verifyProjectAccess(actionData.projectId, userId);
      }
      await prisma.task.updateMany({
        where: { id: { in: taskIds } },
        data: {
          ...(actionData?.projectId && { projectId: actionData.projectId }),
          ...(actionData?.sectionId !== undefined && { sectionId: actionData.sectionId }),
        },
      });
      break;

    case 'updatePriority':
      if (actionData?.priority) {
        await prisma.task.updateMany({
          where: { id: { in: taskIds } },
          data: { priority: actionData.priority },
        });
      }
      break;
  }

  return { message: `Bulk ${action} completed successfully`, count: taskIds.length };
}

export async function quickAddTask(
  text: string,
  defaultProjectId: string | undefined,
  userId: string,
) {
  const parsed = await parseQuickAdd(text, userId);

  // Use parsed projectId, or default, or user's first project
  let projectId = parsed.projectId || defaultProjectId;
  if (!projectId) {
    const defaultProject = await prisma.project.findFirst({
      where: { ownerId: userId, isInbox: true },
      select: { id: true },
    });
    if (!defaultProject) {
      throw new NotFoundError('No default project found');
    }
    projectId = defaultProject.id;
  }

  return createTask(
    {
      content: parsed.content,
      projectId,
      dueDate: parsed.dueDate,
      dueTime: parsed.dueTime,
      priority: parsed.priority,
      labelIds: parsed.labelIds,
      duration: parsed.duration,
      isRecurring: parsed.isRecurring,
      recurrenceRule: parsed.recurrenceRule,
    },
    userId,
  );
}

export async function reorderTasks(taskIds: string[], userId: string) {
  if (taskIds.length === 0) return { message: 'Nothing to reorder' };

  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    include: { project: { select: { ownerId: true, workspaceId: true } } },
  });

  if (tasks.length !== taskIds.length) {
    throw new NotFoundError('One or more tasks not found');
  }

  await verifyBulkTaskAccess(tasks, userId);

  // Single UPDATE via a parameterized VALUES table — one round trip, no injection risk
  const valuePlaceholders = taskIds.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
  const params = taskIds.flatMap((id, index) => [id, index]);

  await prisma.$executeRawUnsafe(
    `UPDATE tasks t
     SET "sortOrder" = v.sort_order::int
     FROM (VALUES ${valuePlaceholders}) AS v(id, sort_order)
     WHERE t.id = v.id`,
    ...params,
  );

  return { message: 'Tasks reordered successfully' };
}
