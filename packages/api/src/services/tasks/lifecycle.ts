// Creating, editing, deleting, duplicating and quick-adding tasks.
import { prisma } from '../../config/database.js';
import type { Prisma } from '@prisma/client';
import { NotFoundError } from '../../errors/index.js';
import { assertVersion, createOnce } from '../versioning.js';
import { requireTaskAccess, requireProjectAccess, taskAccessWhere } from '../access.js';
import type { CreateTaskInput, UpdateTaskInput } from '@taskflow/contract';
import { parseQuickAdd } from '../../utils/quickAddParser.js';
import { recomputeRelativeReminders } from '../reminderService.js';
import { logActivity } from '../activityService.js';
import { reclaimAttachments } from '../fileService.js';
import {
  broadcastTaskCreated,
  broadcastTaskUpdated,
  broadcastTaskDeleted,
} from '../syncService.js';
import {
  assertTaskReferences,
  notifyAssignment,
  runSideEffect,
  taskInclude,
} from './support.js';
import { assertLabelsInScope, projectLabelScope } from '../labelScope.js';

export async function createTask(data: CreateTaskInput, userId: string) {
  await requireProjectAccess(data.projectId, userId, 'EDIT');
  if (data.labelIds?.length) {
    await assertLabelsInScope(data.labelIds, await projectLabelScope(data.projectId));
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

  // With a client id, a retry of a create that already landed gets the
  // task back instead of a duplicate.
  const { row: task, created } = await createOnce(
    data.id,
    () => prisma.task.findFirst({ where: { id: data.id, deletedAt: undefined }, include: taskInclude }),
    (row) => row.creatorId === userId && row.projectId === data.projectId,
    () => prisma.task.create({
    data: {
      ...(data.id && { id: data.id }),
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
  }),
  );
  if (!created) return task;

  runSideEffect('logActivity:CREATED', () => logActivity({
    action: 'CREATED',
    entityType: 'TASK',
    entityId: task.id,
    userId,
    taskId: task.id,
    newData: { content: data.content, projectId: data.projectId },
  }));
  runSideEffect('broadcastTaskCreated', () => broadcastTaskCreated(task));

  if (task.assigneeId && task.assigneeId !== userId) {
    runSideEffect('notify:TASK_ASSIGNED', () =>
      notifyAssignment(task, userId),
    );
  }

  return task;
}

export async function updateTask(
  id: string,
  data: UpdateTaskInput,
  userId: string,
) {
  const oldTask = await requireTaskAccess(id, userId, 'EDIT');

  const { labelIds, ifVersion, ...updateData } = data;

  if (labelIds !== undefined && labelIds.length > 0) {
    await assertLabelsInScope(labelIds, await projectLabelScope(oldTask.projectId));
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
    // Before anything else: replacing labels bumps the version too.
    await assertVersion(tx, 'tasks', id, ifVersion, () =>
      tx.task.findUniqueOrThrow({ where: { id }, include: taskInclude }),
    );
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

  // Only on an actual change of hands — re-saving a task whose assignee is
  // unchanged must not re-notify them.
  if (task.assigneeId && task.assigneeId !== oldTask.assigneeId) {
    runSideEffect('notify:TASK_ASSIGNED', () => notifyAssignment(task, userId));
  }

  return task;
}

/** The task and every task beneath it (subtasks of subtasks, …). */
async function withDescendants(id: string, where: Prisma.TaskWhereInput = {}): Promise<string[]> {
  const ids = [id];
  let frontier = [id];
  while (frontier.length > 0) {
    const children: Array<{ id: string }> = await prisma.task.findMany({
      where: { parentId: { in: frontier }, ...where },
      select: { id: true },
    });
    frontier = children.map((c) => c.id);
    ids.push(...frontier);
  }
  return ids;
}

/**
 * Move a task (and its subtasks) to the trash. It disappears everywhere but
 * can be restored for 30 days; after that the maintenance job deletes it.
 * All of them share one deletedAt, which is how restore knows which subtasks
 * went with it (as opposed to ones trashed separately earlier).
 */
export async function deleteTask(id: string, userId: string) {
  const task = await requireTaskAccess(id, userId, 'EDIT');
  const ids = await withDescendants(id);
  await prisma.task.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });

  runSideEffect('logActivity:DELETED', () => logActivity({
    action: 'DELETED',
    entityType: 'TASK',
    entityId: id,
    userId,
    taskId: id,
    oldData: { content: task.content, projectId: task.projectId },
  }));
  runSideEffect('broadcastTaskDeleted', () => broadcastTaskDeleted(id, task.projectId));

  return { message: 'Task moved to trash' };
}

/**
 * Bring a task back from the trash, with the subtasks that were trashed with
 * it. If its parent is still in the trash it comes back as a top-level task,
 * rather than invisibly under a hidden parent.
 */
export async function restoreTask(id: string, userId: string) {
  const task = await requireTaskAccess(id, userId, 'EDIT', { inTrash: true });
  const trashedAt = task.deletedAt!;
  const ids = await withDescendants(id, { deletedAt: trashedAt });

  let parentId = task.parentId;
  if (parentId) {
    const parent = await prisma.task.findUnique({ where: { id: parentId }, select: { id: true } });
    if (!parent) parentId = null;
  }

  await prisma.$transaction([
    prisma.task.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null } }),
    ...(parentId !== task.parentId
      ? [prisma.task.update({ where: { id }, data: { parentId } })]
      : []),
  ]);

  const restored = await prisma.task.findUniqueOrThrow({ where: { id }, include: taskInclude });
  runSideEffect('logActivity:RESTORED', () => logActivity({
    action: 'UPDATED',
    entityType: 'TASK',
    entityId: id,
    userId,
    taskId: id,
    newData: { restored: true },
  }));
  runSideEffect('broadcastTaskCreated', () => broadcastTaskCreated(restored));
  return restored;
}

/** Delete a trashed task now, instead of waiting out the 30 days. */
export async function purgeTask(id: string, userId: string) {
  await requireTaskAccess(id, userId, 'EDIT', { inTrash: true });
  await purgeTasks([id]);
  return { message: 'Task deleted permanently' };
}

/**
 * Hard-delete tasks (subtasks cascade) and reclaim their attachments' bytes:
 * attachment rows outlive their task as orphans (SetNull), so collect them
 * across the whole subtree first.
 */
export async function purgeTasks(ids: string[]) {
  if (ids.length === 0) return 0;
  const subtree = (await Promise.all(ids.map((id) => withDescendants(id, { deletedAt: { not: null } })))).flat();
  const attachments = await prisma.attachment.findMany({
    where: { taskId: { in: subtree } },
    select: { id: true, url: true },
  });
  const { count } = await prisma.task.deleteMany({ where: { id: { in: ids }, deletedAt: { not: null } } });
  runSideEffect('reclaimAttachments', () => reclaimAttachments(attachments));
  return count;
}

export const TRASH_DAYS = 30;

/**
 * What the user can see in the trash: tasks trashed on their own, newest
 * first. Subtasks trashed along with their parent are shown as part of it,
 * not separately.
 */
export async function getTrash(userId: string) {
  const trashed = await prisma.task.findMany({
    where: { deletedAt: { not: null }, AND: [taskAccessWhere(userId)] },
    include: {
      project: { select: { id: true, name: true, color: true } },
      parent: { select: { deletedAt: true } },
    },
    orderBy: [{ deletedAt: 'desc' }, { id: 'asc' }],
    take: 500,
  });
  return trashed
    .filter((t) => !t.parent || t.parent.deletedAt?.getTime() !== t.deletedAt?.getTime())
    .slice(0, 200)
    .map(({ parent: _parent, ...task }) => ({
      ...task,
      deletedAt: task.deletedAt!,
      purgeAt: new Date(task.deletedAt!.getTime() + TRASH_DAYS * 24 * 60 * 60 * 1000),
    }));
}

/** Delete everything that has been in the trash for longer than TRASH_DAYS. */
export async function purgeExpiredTrash(now = new Date()) {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * 24 * 60 * 60 * 1000);
  const expired = await prisma.task.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true },
  });
  return purgeTasks(expired.map((t) => t.id));
}

/**
 * Copy a task, its labels, and its whole subtask tree.
 *
 * The labels and subtasks used to be dropped: duplicating a checklist gave you
 * an empty shell of its parent, which is the opposite of why anyone duplicates
 * a task. Nothing was broadcast either, so the copy stayed invisible to every
 * other client until a reload.
 */
export async function duplicateTask(id: string, userId: string) {
  const original = await requireTaskAccess(id, userId, 'EDIT');

  const task = await prisma.$transaction(async (tx) => {
    const labels = await tx.taskLabel.findMany({
      where: { taskId: id },
      select: { labelId: true },
    });

    const copy = await tx.task.create({
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
        // Label rows are per-user, but a duplicate is a copy of the same task in
        // the same project — carrying them over is the expected behaviour, and
        // the originals were already validated as owned when they were attached.
        taskLabels: labels.length
          ? { create: labels.map((l) => ({ labelId: l.labelId })) }
          : undefined,
      },
      include: taskInclude,
    });

    // Recreate descendants breadth-first, remapping each level's parent to the
    // copy that was just made. Depth is bounded by the cycle guard in
    // assertTaskReferences, so this terminates on any tree the API can produce.
    let frontier = [{ originalId: id, copyId: copy.id }];
    while (frontier.length > 0) {
      const children = await tx.task.findMany({
        where: { parentId: { in: frontier.map((f) => f.originalId) } },
        include: { taskLabels: { select: { labelId: true } } },
        orderBy: { sortOrder: 'asc' },
      });
      if (children.length === 0) break;

      const copyIdByOriginal = new Map(frontier.map((f) => [f.originalId, f.copyId]));
      const nextFrontier: Array<{ originalId: string; copyId: string }> = [];

      for (const child of children) {
        const newParentId = copyIdByOriginal.get(child.parentId!);
        if (!newParentId) continue;
        const childCopy = await tx.task.create({
          data: {
            content: child.content,
            description: child.description,
            projectId: child.projectId,
            sectionId: child.sectionId,
            parentId: newParentId,
            creatorId: userId,
            assigneeId: child.assigneeId,
            dueDate: child.dueDate,
            dueTime: child.dueTime,
            deadline: child.deadline,
            duration: child.duration,
            priority: child.priority,
            isRecurring: child.isRecurring,
            recurrenceRule: child.recurrenceRule,
            sortOrder: child.sortOrder,
            taskLabels: child.taskLabels.length
              ? { create: child.taskLabels.map((l) => ({ labelId: l.labelId })) }
              : undefined,
          },
          select: { id: true },
        });
        nextFrontier.push({ originalId: child.id, copyId: childCopy.id });
      }

      frontier = nextFrontier;
    }

    // Re-read so the response carries the copied subtasks, not an empty array.
    return tx.task.findUniqueOrThrow({ where: { id: copy.id }, include: taskInclude });
  });

  runSideEffect('logActivity:CREATED', () => logActivity({
    action: 'CREATED',
    entityType: 'TASK',
    entityId: task.id,
    userId,
    taskId: task.id,
    newData: { content: task.content, projectId: task.projectId, duplicatedFrom: id },
  }));
  runSideEffect('broadcastTaskCreated', () => broadcastTaskCreated(task));

  return task;
}

export async function quickAddTask(
  text: string,
  defaultProjectId: string | undefined,
  userId: string,
  due: {
    dueDate?: string;
    dueTime?: string;
    defaultDueDate?: string;
    defaultDueTime?: string;
    sectionId?: string;
  } = {},
) {
  // With no project named in the text or given by the caller, the task goes
  // to the Inbox. Labels in the text are matched in the destination's space.
  let fallbackProjectId = defaultProjectId;
  if (!fallbackProjectId) {
    const inbox = await prisma.project.findFirst({
      where: { ownerId: userId, isInbox: true },
      select: { id: true },
    });
    if (!inbox) {
      throw new NotFoundError('No default project found');
    }
    fallbackProjectId = inbox.id;
  }
  const parsed = await parseQuickAdd(text, userId, fallbackProjectId);
  const projectId = parsed.projectId ?? fallbackProjectId;

  return createTask(
    {
      content: parsed.content,
      projectId,
      // A section only means something in the project the box belongs to.
      sectionId: projectId === defaultProjectId ? due.sectionId : undefined,
      dueDate: due.dueDate ?? parsed.dueDate ?? due.defaultDueDate,
      dueTime: due.dueTime ?? parsed.dueTime ?? due.defaultDueTime,
      priority: parsed.priority,
      labelIds: parsed.labelIds,
      assigneeId: parsed.assigneeId,
      duration: parsed.duration,
      isRecurring: parsed.isRecurring,
      recurrenceRule: parsed.recurrenceRule,
    },
    userId,
  );
}
