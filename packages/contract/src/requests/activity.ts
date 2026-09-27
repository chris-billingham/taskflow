import { z } from 'zod';

export const activityQuerySchema = z.object({
  /** Most recent first; capped so one request can't pull the whole log. */
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const projectIdParamsSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
});
