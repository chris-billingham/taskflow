import { prisma } from '../config/database.js';
import { taskInclude } from './taskService.js';
// Full visibility scope (owned + direct member + workspace + assigned): the
// old local fragment ignored workspaces, so team tasks silently vanished from
// Today/Upcoming while remaining visible in their project views.
import { taskAccessWhere } from './access.js';
import { getUserTimezone, userDayBoundariesUTC } from '../utils/dates.js';

// Safety cap: these views serialise nested subtasks per task; unbounded they
// OOMed the container on mature accounts. The badge count is queried separately
// so the cap never becomes a wrong number (see VIEW_TASK_CAP usages).
const VIEW_TASK_CAP = 500;

export async function getTodayTasks(userId: string) {
  // Boundaries are the USER's calendar day (their IANA timezone), encoded as
  // the UTC-midnight instants stored due dates use — server TZ is irrelevant.
  const { todayStart, tomorrowStart } = userDayBoundariesUTC(
    await getUserTimezone(userId),
  );

  const where = {
    ...taskAccessWhere(userId),
    isCompleted: false,
    parentId: null,
    dueDate: { lt: tomorrowStart },
  };

  // Counted against the same predicate rather than derived from the capped
  // array: `total` used to be `tasks.length`, so once an account crossed the
  // cap the Today badge silently under-reported and the surplus was invisible.
  const [tasks, matchingTotal] = await Promise.all([
    prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: { sortOrder: 'asc' },
      take: VIEW_TASK_CAP,
    }),
    prisma.task.count({ where }),
  ]);

  const overdue: typeof tasks = [];
  const morning: typeof tasks = [];
  const afternoon: typeof tasks = [];
  const evening: typeof tasks = [];
  const noTime: typeof tasks = [];

  for (const task of tasks) {
    const taskDate = task.dueDate ? new Date(task.dueDate) : null;
    if (taskDate && taskDate < todayStart) {
      overdue.push(task);
    } else if (task.dueTime) {
      const [hours] = task.dueTime.split(':').map(Number);
      if (hours < 12) {
        morning.push(task);
      } else if (hours < 17) {
        afternoon.push(task);
      } else {
        evening.push(task);
      }
    } else {
      noTime.push(task);
    }
  }

  return {
    overdue,
    morning,
    afternoon,
    evening,
    noTime,
    counts: {
      // Bucket counts describe what was returned; total describes what matched.
      overdue: overdue.length,
      morning: morning.length,
      afternoon: afternoon.length,
      evening: evening.length,
      noTime: noTime.length,
      total: matchingTotal,
      returned: tasks.length,
    },
    // Lets the client say so rather than quietly showing a partial list.
    truncated: matchingTotal > tasks.length,
  };
}

export async function getUpcomingTasks(
  userId: string,
  days: number = 7,
  includeNoDate: boolean = false,
) {
  const { todayStart } = userDayBoundariesUTC(await getUserTimezone(userId));
  const endDate = new Date(todayStart);
  endDate.setUTCDate(endDate.getUTCDate() + days);

  // Overdue + upcoming range
  const datedWhere = {
    ...taskAccessWhere(userId),
    isCompleted: false,
    parentId: null,
    dueDate: { lt: endDate },
  };

  const [tasks, datedTotal] = await Promise.all([
    prisma.task.findMany({
      where: datedWhere,
      include: taskInclude,
      orderBy: [{ dueDate: 'asc' }, { sortOrder: 'asc' }],
      take: VIEW_TASK_CAP,
    }),
    prisma.task.count({ where: datedWhere }),
  ]);

  const overdue: typeof tasks = [];
  const byDate: Record<string, typeof tasks> = {};

  for (const task of tasks) {
    const taskDate = task.dueDate ? new Date(task.dueDate) : null;
    if (taskDate && taskDate < todayStart) {
      overdue.push(task);
    } else if (taskDate) {
      const dateKey = taskDate.toISOString().split('T')[0];
      if (!byDate[dateKey]) byDate[dateKey] = [];
      byDate[dateKey].push(task);
    }
  }

  let noDateTasks: typeof tasks = [];
  let noDateTotal = 0;
  if (includeNoDate) {
    const noDateWhere = {
      ...taskAccessWhere(userId),
      isCompleted: false,
      parentId: null,
      dueDate: null,
    };

    [noDateTasks, noDateTotal] = await Promise.all([
      prisma.task.findMany({
        where: noDateWhere,
        include: taskInclude,
        orderBy: { sortOrder: 'asc' },
        take: VIEW_TASK_CAP,
      }),
      prisma.task.count({ where: noDateWhere }),
    ]);
  }

  const returned = tasks.length + noDateTasks.length;

  return {
    overdue,
    byDate,
    noDate: noDateTasks,
    counts: {
      overdue: overdue.length,
      total: datedTotal + noDateTotal,
      returned,
    },
    truncated: datedTotal + noDateTotal > returned,
  };
}

export async function rescheduleOverdue(userId: string, targetDate: string) {
  const { todayStart } = userDayBoundariesUTC(await getUserTimezone(userId));

  const result = await prisma.task.updateMany({
    where: {
      AND: [
        taskAccessWhere(userId),
        // Bulk-rescheduling is personal: only tasks assigned to the caller,
        // or created by them and unassigned. Without this, one member's
        // "Reschedule all" silently moved every overdue task their teammates
        // could see — including colleagues' assigned work.
        {
          OR: [
            { assigneeId: userId },
            { creatorId: userId, assigneeId: null },
          ],
        },
      ],
      isCompleted: false,
      parentId: null,
      dueDate: { lt: todayStart },
    },
    data: {
      dueDate: new Date(targetDate),
    },
  });

  return { message: 'Overdue tasks rescheduled', count: result.count };
}
