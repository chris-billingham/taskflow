import { Worker, Queue } from 'bullmq';
import { createBullMQConnection } from '../config/redis.js';
import { prisma } from '../config/database.js';
import { notify } from '../services/notificationService.js';
import { isValidTimeZone, userDayBoundariesUTC, zonedWallClockToUTC } from '../utils/dates.js';

const QUEUE_NAME = 'due-task-check';

// Date-only tasks have no instant to count down to, so their notices go out at
// a civil hour in the owner's own timezone rather than at UTC midnight.
const DUE_SOON_LOCAL_HOUR = 8;
const OVERDUE_LOCAL_HOUR = 9;

// How close a timed task must be before it counts as "due soon". Matches the
// hourly cadence of this job: a wider window would notify twice.
const DUE_SOON_WINDOW_MS = 60 * 60 * 1000;

// Tasks a single pass will consider. Bounded so a large instance drains across
// runs instead of loading everything into memory.
const BATCH_SIZE = 500;

export function createDueTaskQueue() {
  return new Queue(QUEUE_NAME, {
    connection: createBullMQConnection(),
    defaultJobOptions: { removeOnComplete: 50, removeOnFail: 20 },
  });
}

/**
 * The user who should hear about a task: its assignee, or its creator when
 * nobody is assigned. Notifying everyone with project access would turn one
 * overdue task into a notification for the whole team.
 */
function recipientOf(task: { assigneeId: string | null; creatorId: string | null }) {
  return task.assigneeId ?? task.creatorId;
}

/**
 * Has this user already been told about this task, for the task as it stands?
 *
 * Keyed on the task's updatedAt rather than a stored flag: one notice per task
 * per edit. A task left overdue for a fortnight is mentioned once, but
 * rescheduling it (which bumps updatedAt) re-arms the notice for the new date.
 * This is also why no migration is needed to make the job idempotent.
 */
async function alreadyNotified(
  userId: string,
  type: 'TASK_DUE_SOON' | 'TASK_OVERDUE',
  taskId: string,
  since: Date,
): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type,
      data: { path: ['taskId'], equals: taskId },
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return existing !== null;
}

async function timezoneOf(userId: string, cache: Map<string, string>) {
  let tz = cache.get(userId);
  if (tz) return tz;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  tz = user?.timezone && isValidTimeZone(user.timezone) ? user.timezone : 'UTC';
  cache.set(userId, tz);
  return tz;
}

/**
 * One pass of the due-soon / overdue check.
 *
 * Exported for tests. Runs hourly, and every decision about *when* a user
 * hears about a task is made in that user's timezone — the alternative (a
 * single UTC cutoff) meant a notice at 08:00 UTC landed at 3am for a third of
 * the world.
 */
export async function runDueTaskCheck(now: Date = new Date()): Promise<{
  dueSoon: number;
  overdue: number;
}> {
  const tzCache = new Map<string, string>();
  let dueSoon = 0;
  let overdue = 0;

  // Widest possible net in one query: anything incomplete with a due date at
  // or before tomorrow. Per-user timezone decides what actually qualifies.
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const candidates = await prisma.task.findMany({
    where: {
      isCompleted: false,
      parentId: null,
      dueDate: { not: null, lt: horizon },
    },
    select: {
      id: true,
      content: true,
      projectId: true,
      dueDate: true,
      dueTime: true,
      assigneeId: true,
      creatorId: true,
      updatedAt: true,
    },
    orderBy: { dueDate: 'asc' },
    take: BATCH_SIZE,
  });

  for (const task of candidates) {
    const userId = recipientOf(task);
    if (!userId || !task.dueDate) continue;

    const tz = await timezoneOf(userId, tzCache);
    const { todayStart } = userDayBoundariesUTC(tz, now);

    // Overdue: the due date is behind the user's current calendar day. The
    // notice waits for a civil hour so a task that tips over at local midnight
    // doesn't wake anybody.
    if (task.dueDate < todayStart) {
      const announceAt = zonedWallClockToUTC(
        todayStart,
        `${String(OVERDUE_LOCAL_HOUR).padStart(2, '0')}:00`,
        tz,
      );
      if (now >= announceAt && !(await alreadyNotified(userId, 'TASK_OVERDUE', task.id, task.updatedAt))) {
        await notify(
          userId,
          'TASK_OVERDUE',
          'Task overdue',
          `"${task.content}" is past its due date`,
          { taskId: task.id, projectId: task.projectId },
        );
        overdue++;
      }
      continue;
    }

    // Due soon. A timed task counts down to its actual instant; a date-only
    // task is announced on the morning of the day it is due.
    const announceAt = task.dueTime
      ? new Date(
          zonedWallClockToUTC(task.dueDate, task.dueTime, tz).getTime() - DUE_SOON_WINDOW_MS,
        )
      : zonedWallClockToUTC(
          task.dueDate,
          `${String(DUE_SOON_LOCAL_HOUR).padStart(2, '0')}:00`,
          tz,
        );

    if (now < announceAt) continue;
    if (await alreadyNotified(userId, 'TASK_DUE_SOON', task.id, task.updatedAt)) continue;

    await notify(
      userId,
      'TASK_DUE_SOON',
      'Task due soon',
      task.dueTime
        ? `"${task.content}" is due at ${task.dueTime}`
        : `"${task.content}" is due today`,
      { taskId: task.id, projectId: task.projectId },
    );
    dueSoon++;
  }

  return { dueSoon, overdue };
}

export function startDueTaskWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const { dueSoon, overdue } = await runDueTaskCheck();
      if (dueSoon || overdue) {
        console.log(
          `[DueTask] sent ${dueSoon} due-soon and ${overdue} overdue notification(s)`,
        );
      }
    },
    { connection: createBullMQConnection(), concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    console.error(`Due-task job ${job?.id} failed:`, err.message);
  });

  return worker;
}

export async function scheduleDueTaskChecks(queue: Queue) {
  // Hourly: fine-grained enough for the one-hour due-soon window, and cheap
  // because the dedupe check keeps repeat passes silent.
  await queue.add('check-due-tasks', {}, { repeat: { pattern: '0 * * * *' } });
}
