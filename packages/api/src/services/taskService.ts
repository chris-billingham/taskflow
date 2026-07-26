import { prisma } from '../config/database.js';
import type { Prisma } from '@prisma/client';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors/index.js';
import {
  requireTaskAccess,
  requireProjectAccess,
  taskAccessWhere,
  effectiveProjectLevels,
  levelSatisfies,
  hasProjectAccess,
  type AccessLevel,
} from './access.js';
import { getRequestId } from '../utils/requestContext.js';
import type {
  CreateTaskInput,
  UpdateTaskInput,
  TaskQuery,
  BulkTaskInput,
  MoveTaskInput,
} from '../schemas/task.js';
import { parseQuickAdd } from '../utils/quickAddParser.js';
import { getNextOccurrence, advanceRecurrenceRule } from '../utils/recurrence.js';
import {
  computeRelativeTriggerAt,
  recomputeRelativeReminders,
} from './reminderService.js';
import { logActivity } from './activityService.js';
import { reclaimAttachments } from './fileService.js';
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

/**
 * Validate references a task points at. Every one of these is attacker-
 * controlled input that previously went straight into the write:
 * - sectionId must belong to the task's project (else the task renders in a
 *   foreign project's board, or nowhere).
 * - parentId must be a task in the SAME project and must not create a cycle.
 *   An unvalidated parentId let any user graft their task under an arbitrary
 *   task id — disclosing the victim's task content through the `parent`
 *   include and polluting their subtask lists.
 * - assigneeId must be a user who can see the project (assignment otherwise
 *   injects tasks into a stranger's views/search).
 */
async function assertTaskReferences(
  {
    projectId,
    sectionId,
    parentId,
    assigneeId,
    taskId,
  }: {
    projectId: string;
    sectionId?: string | null;
    parentId?: string | null;
    assigneeId?: string | null;
    taskId?: string; // present on updates, for cycle detection
  },
) {
  if (sectionId) {
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      select: { projectId: true },
    });
    if (!section || section.projectId !== projectId) {
      throw new ValidationError('Section does not belong to this project');
    }
  }

  if (parentId) {
    if (taskId && parentId === taskId) {
      throw new ValidationError('A task cannot be its own parent');
    }
    const parent = await prisma.task.findUnique({
      where: { id: parentId },
      select: { projectId: true, parentId: true },
    });
    if (!parent || parent.projectId !== projectId) {
      throw new ValidationError('Parent task does not belong to this project');
    }
    // Walk the ancestor chain to reject cycles (bounded to be safe against
    // pre-existing bad data).
    if (taskId) {
      let cursor = parent.parentId;
      for (let depth = 0; cursor && depth < 100; depth++) {
        if (cursor === taskId) {
          throw new ValidationError('Cannot nest a task under its own subtask');
        }
        const next: { parentId: string | null } | null = await prisma.task.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
        cursor = next?.parentId ?? null;
      }
    }
  }

  if (assigneeId) {
    if (!(await hasProjectAccess(projectId, assigneeId, 'VIEW'))) {
      throw new ValidationError(
        'Assignee does not have access to this project',
      );
    }
  }
}

type TaskWithProject = {
  id: string;
  projectId: string;
  assigneeId: string | null;
  project: { ownerId: string | null; workspaceId: string | null };
};

/**
 * Bulk access check: the user must hold `level` on every task's project (or
 * be the task's assignee, who can always work their own task). Resolved with
 * two queries regardless of task count.
 */
async function verifyBulkTaskAccess(
  tasks: TaskWithProject[],
  userId: string,
  level: AccessLevel = 'EDIT',
) {
  const levels = await effectiveProjectLevels(
    tasks.map((t) => ({
      id: t.projectId,
      ownerId: t.project.ownerId,
      workspaceId: t.project.workspaceId,
    })),
    userId,
  );

  for (const task of tasks) {
    if (task.assigneeId === userId && levelSatisfies('EDIT', level)) continue;
    if (levelSatisfies(levels.get(task.projectId), level)) continue;
    throw new ForbiddenError('You do not have access to all specified tasks');
  }
}

export async function getTasks(query: TaskQuery, userId: string) {
  const where: Prisma.TaskWhereInput = {
    AND: [taskAccessWhere(userId)],
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

  const take = query.limit ?? 100;
  const tasks = await prisma.task.findMany({
    where,
    include: taskListInclude,
    // The id tiebreak makes the sort total, so the cursor never skips or
    // repeats rows that share a sortOrder.
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    take: take + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  const hasMore = tasks.length > take;
  const page = hasMore ? tasks.slice(0, take) : tasks;
  return {
    tasks: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export async function getTaskById(id: string, userId: string) {
  await requireTaskAccess(id, userId, 'VIEW');

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
  await requireProjectAccess(data.projectId, userId, 'EDIT');
  if (data.labelIds?.length) {
    await assertLabelsOwned(data.labelIds, userId);
  }
  await assertTaskReferences({
    projectId: data.projectId,
    sectionId: data.sectionId,
    parentId: data.parentId,
    assigneeId: data.assigneeId,
  });

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
  const oldTask = await requireTaskAccess(id, userId, 'EDIT');

  const { labelIds, ...updateData } = data;

  if (labelIds !== undefined && labelIds.length > 0) {
    await assertLabelsOwned(labelIds, userId);
  }
  await assertTaskReferences({
    projectId: oldTask.projectId,
    sectionId: updateData.sectionId,
    parentId: updateData.parentId,
    assigneeId: updateData.assigneeId,
    taskId: id,
  });

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

  // A moved deadline must re-arm RELATIVE reminders — otherwise they keep
  // firing at the OLD offset (or stay dead if already sent).
  if (updateData.dueDate !== undefined || updateData.dueTime !== undefined) {
    runSideEffect('recomputeRelativeReminders', () =>
      recomputeRelativeReminders(task.id, task.dueDate, task.dueTime));
  }

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
  const task = await requireTaskAccess(id, userId, 'EDIT');

  // Attachment rows survive task deletion as orphans (SetNull) — collect the
  // whole subtree's attachments first so their bytes can be reclaimed.
  const descendantIds = [id];
  let frontier = [id];
  while (frontier.length > 0) {
    const children: Array<{ id: string }> = await prisma.task.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((c) => c.id);
    descendantIds.push(...frontier);
  }
  const attachments = await prisma.attachment.findMany({
    where: { taskId: { in: descendantIds } },
    select: { id: true, url: true },
  });

  // Cascade delete handles subtasks via Prisma schema
  await prisma.task.delete({ where: { id } });

  runSideEffect('reclaimAttachments', () => reclaimAttachments(attachments));

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
  const task = await requireTaskAccess(id, userId, 'EDIT');

  // Idempotency guard: a double-click or concurrent request must not re-run the
  // completion logic (which, for recurring tasks, spawns the next occurrence).
  if (task.isCompleted) {
    return prisma.task.findUniqueOrThrow({ where: { id }, include: taskInclude });
  }

  // getNextOccurrence returns null when the series has ended (UNTIL passed
  // or COUNT exhausted) — in that case fall through to a plain completion.
  const fromDate = task.dueDate || new Date();
  const nextDate =
    task.isRecurring && task.recurrenceRule
      ? getNextOccurrence(task.recurrenceRule, fromDate)
      : null;

  if (task.isRecurring && task.recurrenceRule && nextDate) {
    // The deadline travels as an offset from the due date, not as the stale
    // absolute instant (which made every later occurrence born overdue).
    const deadlineOffsetMs =
      task.deadline && task.dueDate
        ? task.deadline.getTime() - task.dueDate.getTime()
        : null;
    const nextRule = advanceRecurrenceRule(task.recurrenceRule);

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
          deadline:
            deadlineOffsetMs !== null
              ? new Date(nextDate.getTime() + deadlineOffsetMs)
              : task.deadline,
          duration: task.duration,
          priority: task.priority,
          isRecurring: true,
          recurrenceRule: nextRule,
          sortOrder: task.sortOrder,
          taskLabels: labels.length
            ? { create: labels.map((l) => ({ labelId: l.labelId })) }
            : undefined,
        },
        include: taskInclude,
      });

      // Carry RELATIVE reminders to the next occurrence, re-armed against the
      // new due date. (They used to fire once and never again.)
      const reminders = await tx.reminder.findMany({
        where: { taskId: id, type: 'RELATIVE', minutesBefore: { not: null } },
        select: { userId: true, minutesBefore: true, method: true },
      });
      if (reminders.length > 0) {
        await tx.reminder.createMany({
          data: reminders.map((r) => ({
            taskId: created.id,
            userId: r.userId,
            type: 'RELATIVE' as const,
            minutesBefore: r.minutesBefore,
            method: r.method,
            triggerAt: computeRelativeTriggerAt(nextDate, task.dueTime, r.minutesBefore!),
          })),
        });
      }

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
  const oldTask = await requireTaskAccess(id, userId, 'EDIT');

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
  const oldTask = await requireTaskAccess(id, userId, 'EDIT');

  if (data.projectId) {
    await requireProjectAccess(data.projectId, userId, 'EDIT');
  }
  await assertTaskReferences({
    projectId: data.projectId ?? oldTask.projectId,
    sectionId: data.sectionId,
    parentId: data.parentId,
    taskId: id,
  });

  const targetProjectId = data.projectId ?? oldTask.projectId;
  const projectChanged = targetProjectId !== oldTask.projectId;

  const updateData: Prisma.TaskUpdateInput = {
    ...(data.projectId !== undefined && { project: { connect: { id: data.projectId } } }),
    // Sections belong to a project: on a cross-project move the old section
    // CANNOT come along. Clear it unless a (validated) target section came in.
    ...(data.sectionId !== undefined
      ? {
          section: data.sectionId
            ? { connect: { id: data.sectionId } }
            : { disconnect: true },
        }
      : projectChanged
        ? { section: { disconnect: true } }
        : {}),
    ...(data.parentId !== undefined && {
      parent: data.parentId ? { connect: { id: data.parentId } } : { disconnect: true },
    }),
  };

  const task = await prisma.$transaction(async (tx) => {
    const moved = await tx.task.update({
      where: { id },
      data: updateData,
      include: taskInclude,
    });

    if (projectChanged) {
      // Subtasks live in their parent's project — bring the whole descendant
      // tree along (they used to be orphaned in the source project, pointing
      // at a parent across the boundary). Their sections stay behind.
      let parentIds = [id];
      while (parentIds.length > 0) {
        const children = await tx.task.findMany({
          where: { parentId: { in: parentIds } },
          select: { id: true },
        });
        if (children.length === 0) break;
        const childIds = children.map((c) => c.id);
        await tx.task.updateMany({
          where: { id: { in: childIds } },
          data: { projectId: targetProjectId, sectionId: null },
        });
        parentIds = childIds;
      }
    }

    return moved;
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
  const original = await requireTaskAccess(id, userId, 'EDIT');

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
    select: {
      id: true,
      projectId: true,
      assigneeId: true,
      project: { select: { ownerId: true, workspaceId: true } },
    },
  });

  if (tasks.length !== taskIds.length) {
    throw new NotFoundError('One or more tasks not found');
  }

  await verifyBulkTaskAccess(tasks, userId);

  // Re-broadcast + activity-log a set of tasks after a bulk mutation. Bulk
  // operations used to be silent: no websocket events (other clients showed
  // stale state until reload) and no activity trail.
  async function emitBulkUpdated(ids: string[], action: 'UPDATED' | 'UNCOMPLETED' | 'MOVED') {
    const updated = await prisma.task.findMany({
      where: { id: { in: ids } },
      include: taskInclude,
    });
    for (const t of updated) {
      runSideEffect('logActivity:bulk', () => logActivity({
        action,
        entityType: 'TASK',
        entityId: t.id,
        userId,
        taskId: t.id,
        newData: { content: t.content },
      }));
      runSideEffect('broadcastTaskUpdated', () => broadcastTaskUpdated(t));
    }
  }

  switch (action) {
    case 'complete':
      // Through completeTask so recurring tasks spawn their next occurrence
      // (a raw updateMany silently TERMINATED every recurring series in the
      // selection) and every completion broadcasts + logs.
      for (const taskId of taskIds) {
        await completeTask(taskId, userId);
      }
      break;

    case 'uncomplete':
      await prisma.task.updateMany({
        where: { id: { in: taskIds } },
        data: { isCompleted: false, completedAt: null },
      });
      await emitBulkUpdated(taskIds, 'UNCOMPLETED');
      break;

    case 'delete':
      await prisma.task.deleteMany({
        where: { id: { in: taskIds } },
      });
      for (const t of tasks) {
        runSideEffect('logActivity:bulkDelete', () => logActivity({
          action: 'DELETED',
          entityType: 'TASK',
          entityId: t.id,
          userId,
        }));
        runSideEffect('broadcastTaskDeleted', () => broadcastTaskDeleted(t.id, t.projectId));
      }
      break;

    case 'move': {
      if (actionData?.projectId) {
        await requireProjectAccess(actionData.projectId, userId, 'EDIT');
      }
      if (actionData?.sectionId) {
        // All tasks land in the same target; the section must belong to it.
        const targetProjectId = actionData?.projectId ?? tasks[0]?.projectId;
        const sameProject = tasks.every((t) => t.projectId === (actionData?.projectId ?? t.projectId));
        if (!sameProject && !actionData?.projectId) {
          throw new ValidationError('Cannot bulk-set a section across different projects');
        }
        await assertTaskReferences({
          projectId: targetProjectId,
          sectionId: actionData.sectionId,
        });
      }

      const movingProject = Boolean(actionData?.projectId);
      await prisma.$transaction(async (tx) => {
        await tx.task.updateMany({
          where: { id: { in: taskIds } },
          data: {
            ...(actionData?.projectId && { projectId: actionData.projectId }),
            // On a cross-project move a stale section id must never survive.
            ...(actionData?.sectionId !== undefined
              ? { sectionId: actionData.sectionId }
              : movingProject
                ? { sectionId: null }
                : {}),
          },
        });

        if (movingProject) {
          // Descendants follow their parents across the project boundary.
          let parentIds = taskIds;
          while (parentIds.length > 0) {
            const children = await tx.task.findMany({
              where: { parentId: { in: parentIds }, id: { notIn: taskIds } },
              select: { id: true },
            });
            if (children.length === 0) break;
            const childIds = children.map((c) => c.id);
            await tx.task.updateMany({
              where: { id: { in: childIds } },
              data: { projectId: actionData!.projectId!, sectionId: null },
            });
            parentIds = childIds;
          }
        }
      });
      await emitBulkUpdated(taskIds, 'MOVED');
      break;
    }

    case 'updatePriority':
      if (actionData?.priority) {
        await prisma.task.updateMany({
          where: { id: { in: taskIds } },
          data: { priority: actionData.priority },
        });
        await emitBulkUpdated(taskIds, 'UPDATED');
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
    select: {
      id: true,
      projectId: true,
      assigneeId: true,
      project: { select: { ownerId: true, workspaceId: true } },
    },
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
