import { z } from 'zod';
import { pageQuery } from '../common.js';

/** Most recent first; capped so one request can't pull the whole log. */
export const activityQuerySchema = pageQuery(100);

export const projectIdParamsSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
});
