import { z } from 'zod';
import { id, instant, type Wire } from '../common.js';

export const labelSchema = z.object({
  id,
  name: z.string(),
  color: z.string(),
  userId: id,
  isFavorite: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: instant,
  updatedAt: instant,
});
export type Label = Wire<typeof labelSchema>;
