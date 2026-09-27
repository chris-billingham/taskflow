import { z } from 'zod';
import { messageResponse, type Wire } from '../common.js';
import { taskSchema } from './task.js';

const tasks = z.array(taskSchema);

/** GET /views/today: overdue plus today's tasks, bucketed by time of day. */
export const todayViewSchema = z.object({
  overdue: tasks,
  morning: tasks,
  afternoon: tasks,
  evening: tasks,
  noTime: tasks,
  counts: z.object({
    overdue: z.number().int(),
    morning: z.number().int(),
    afternoon: z.number().int(),
    evening: z.number().int(),
    noTime: z.number().int(),
    /** Everything that matched, which may exceed what was returned. */
    total: z.number().int(),
    returned: z.number().int(),
  }),
  /** True when more tasks matched than the view returns (500 cap). */
  truncated: z.boolean(),
});
export type TodayView = Wire<typeof todayViewSchema>;

/** GET /views/upcoming: overdue, then tasks keyed by date (yyyy-MM-dd). */
export const upcomingViewSchema = z.object({
  overdue: tasks,
  byDate: z.record(z.string(), tasks),
  noDate: tasks,
  counts: z.object({
    overdue: z.number().int(),
    total: z.number().int(),
    returned: z.number().int(),
  }),
  truncated: z.boolean(),
});
export type UpcomingView = Wire<typeof upcomingViewSchema>;

/** POST /views/reschedule-overdue. */
export const rescheduleResultSchema = messageResponse.extend({ count: z.number().int() });
