// Moving, reordering and bulk-editing tasks.
import { prisma } from '../../config/database.js';
import type { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '../../errors/index.js';
import { requireTaskAccess, requireProjectAccess } from '../access.js';
import type { BulkTaskInput, MoveTaskInput } from '@taskflow/contract';
import { logActivity } from '../activityService.js';
import { broadcastTaskUpdated, broadcastTaskDeleted } from '../syncService.js';
import {
  assertTaskReferences,
  runSideEffect,
  taskInclude,
  verifyBulkTaskAccess,
} from './support.js';
import { completeTask } from './completion.js';

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
    ...(data.parentId !== undefined
      ? { parent: data.parentId ? { connect: { id: data.parentId } } : { disconnect: true } }
      : // A subtask moved to another project leaves its parent behind and
        // becomes a top-level task there.
        projectChanged && oldTask.parentId
        ? { parent: { disconnect: true } }
        : {}),
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
      // To the trash, like a single delete (subtasks go with their parents).
      await prisma.task.updateMany({
        where: { OR: [{ id: { in: taskIds } }, { parentId: { in: taskIds } }] },
        data: { deletedAt: new Date() },
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
