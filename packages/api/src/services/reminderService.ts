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

export async function createReminder(data: CreateReminderInput, userId: string) {
  const task = await requireTaskAccess(data.taskId, userId, 'VIEW');

  // For RELATIVE reminders, compute triggerAt from task dueDate
  let triggerAt = data.triggerAt ? new Date(data.triggerAt) : null;
  if (data.type === 'RELATIVE' && data.minutesBefore && task.dueDate) {
    const due = new Date(task.dueDate);
    if (task.dueTime) {
      const [hours, minutes] = task.dueTime.split(':').map(Number);
      due.setHours(hours, minutes, 0, 0);
    }
    triggerAt = new Date(due.getTime() - data.minutesBefore * 60 * 1000);
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

export async function getDueReminders() {
  const now = new Date();

  return prisma.reminder.findMany({
    where: {
      isSent: false,
      triggerAt: { lte: now },
    },
    include: {
      task: { select: { id: true, content: true, dueDate: true, dueTime: true, projectId: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function markReminderSent(id: string) {
  return prisma.reminder.update({
    where: { id },
    data: { isSent: true, sentAt: new Date() },
  });
}
