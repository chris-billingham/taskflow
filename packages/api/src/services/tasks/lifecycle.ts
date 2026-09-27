// Creating, editing, deleting, duplicating and quick-adding tasks.
import { prisma } from '../../config/database.js';
import type { Prisma } from '@prisma/client';
import { NotFoundError } from '../../errors/index.js';
import { requireTaskAccess, requireProjectAccess } from '../access.js';
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
  assertLabelsOwned,
  assertTaskReferences,
  notifyAssignment,
  runSideEffect,
  taskInclude,
} from './support.js';

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

  // Only on an actual change of hands — re-saving a task whose assignee is
  // unchanged must not re-notify them.
  if (task.assigneeId && task.assigneeId !== oldTask.assigneeId) {
    runSideEffect('notify:TASK_ASSIGNED', () => notifyAssignment(task, userId));
  }

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
  due: { dueDate?: string; dueTime?: string } = {},
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
      dueDate: due.dueDate ?? parsed.dueDate,
      dueTime: due.dueTime ?? parsed.dueTime,
      priority: parsed.priority,
      labelIds: parsed.labelIds,
      duration: parsed.duration,
      isRecurring: parsed.isRecurring,
      recurrenceRule: parsed.recurrenceRule,
    },
    userId,
  );
}
