// Completing and reopening tasks, including spawning a recurring task's
// next occurrence.
import { prisma } from '../../config/database.js';
import { requireTaskAccess } from '../access.js';
import { getNextOccurrence, advanceRecurrenceRule } from '../../utils/recurrence.js';
import { computeRelativeTriggerAt } from '../reminderService.js';
import { logActivity } from '../activityService.js';
import { broadcastTaskCreated, broadcastTaskUpdated } from '../syncService.js';
import { runSideEffect, taskInclude } from './support.js';

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
