import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200).trim(),
  /** Comma-separated subset of task,project,comment. Default: all three. */
  type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;
