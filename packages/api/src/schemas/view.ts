import { z } from 'zod';

export const upcomingQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
  includeNoDate: z.enum(['true', 'false']).default('false'),
});

export const rescheduleOverdueSchema = z.object({
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
});

export type UpcomingQuery = z.infer<typeof upcomingQuerySchema>;
export type RescheduleOverdueInput = z.infer<typeof rescheduleOverdueSchema>;
