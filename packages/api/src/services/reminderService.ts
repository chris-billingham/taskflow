import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../errors/index.js';
import { requireTaskAccess } from './access.js';
import type { CreateReminderInput } from '../schemas/reminder.js';

export async function getTaskReminders(taskId: string, userId: string) {
  await requireTaskAccess(taskId, userId, 'VIEW');

  return prisma.reminder.findMany({
    where: { taskId, userId },
    orderBy: { createdAt: 'desc' },
  });
}

/** Trigger instant for a RELATIVE reminder given the task's due date/time. */
export function computeRelativeTriggerAt(
  dueDate: Date | null,
  dueTime: string | null,
  minutesBefore: number,
): Date | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (dueTime) {
    const [hours, minutes] = dueTime.split(':').map(Number);
    due.setHours(hours, minutes, 0, 0);
  }
  return new Date(due.getTime() - minutesBefore * 60 * 1000);
}

export async function createReminder(data: CreateReminderInput, userId: string) {
  const task = await requireTaskAccess(data.taskId, userId, 'VIEW');

  // For RELATIVE reminders, compute triggerAt from task dueDate
  let triggerAt = data.triggerAt ? new Date(data.triggerAt) : null;
  if (data.type === 'RELATIVE' && data.minutesBefore) {
    triggerAt = computeRelativeTriggerAt(task.dueDate, task.dueTime, data.minutesBefore);
  }

  return prisma.reminder.create({
    data: {
      taskId: data.taskId,
      userId,
      type: data.type,
      triggerAt,
      minutesBefore: data.minutesBefore,
      method: data.method ?? 'PUSH',
    },
  });
}

/**
 * Re-arm RELATIVE reminders after a task's due date/time changes. Without
 * this, moving a deadline left reminders firing at the OLD offset (or never),
 * and an already-sent reminder stayed dead for the new date.
 */
export async function recomputeRelativeReminders(
  taskId: string,
  dueDate: Date | null,
  dueTime: string | null,
) {
  const reminders = await prisma.reminder.findMany({
    where: { taskId, type: 'RELATIVE', minutesBefore: { not: null } },
    select: { id: true, minutesBefore: true },
  });

  for (const reminder of reminders) {
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: {
        triggerAt: computeRelativeTriggerAt(dueDate, dueTime, reminder.minutesBefore!),
        isSent: false,
        sentAt: null,
        attempts: 0,
      },
    });
  }
}

export async function deleteReminder(id: string, userId: string) {
  const reminder = await prisma.reminder.findUnique({ where: { id } });
  if (!reminder) {
    throw new NotFoundError('Reminder not found');
  }
  if (reminder.userId !== userId) {
    throw new ForbiddenError('You can only delete your own reminders');
  }

  await prisma.reminder.delete({ where: { id } });
  return { message: 'Reminder deleted successfully' };
}

export async function getUpcomingReminders(userId: string) {
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

  return prisma.reminder.findMany({
    where: {
      userId,
      isSent: false,
      triggerAt: {
        gte: now,
        lte: oneHourFromNow,
      },
    },
    include: {
      task: { select: { id: true, content: true, dueDate: true, dueTime: true } },
    },
    orderBy: { triggerAt: 'asc' },
  });
}

const MAX_DELIVERY_ATTEMPTS = 5;
const DUE_BATCH_SIZE = 200;

export async function getDueReminders() {
  const now = new Date();

  return prisma.reminder.findMany({
    where: {
      isSent: false,
      triggerAt: { lte: now },
      // A reminder for finished work is noise, not a reminder.
      task: { isCompleted: false },
      // Bounded retries: after repeated delivery failures, stop — the old
      // behaviour re-notified every 60 seconds forever.
      attempts: { lt: MAX_DELIVERY_ATTEMPTS },
    },
    include: {
      task: { select: { id: true, content: true, dueDate: true, dueTime: true, projectId: true } },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { triggerAt: 'asc' },
    // Bounded batch: a backlog after downtime is drained across job runs
    // instead of loaded into memory all at once.
    take: DUE_BATCH_SIZE,
  });
}

/**
 * Atomically claim a reminder for delivery. Returns false if another worker
 * (or a previous run) already claimed it — the caller must skip it.
 */
export async function claimReminder(id: string): Promise<boolean> {
  const claim = await prisma.reminder.updateMany({
    where: { id, isSent: false },
    data: { isSent: true, sentAt: new Date() },
  });
  return claim.count > 0;
}

/** Release a claim after a failed delivery, counting the attempt. */
export async function releaseReminderAfterFailure(id: string) {
  await prisma.reminder.updateMany({
    where: { id },
    data: { isSent: false, sentAt: null, attempts: { increment: 1 } },
  });
}
