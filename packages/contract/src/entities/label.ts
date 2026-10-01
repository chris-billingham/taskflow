import { z } from 'zod';
import { id, instant, type Wire } from '../common.js';

/**
 * A label belongs to one space: your own (userId) or a workspace's
 * (workspaceId, a team label everyone in it shares). A task carries only
 * labels from its project's space. isFavorite and sortOrder are yours.
 */
export const labelSchema = z.object({
  id,
  name: z.string(),
  color: z.string(),
  userId: id.nullable(),
  workspaceId: id.nullable(),
  isFavorite: z.boolean(),
  sortOrder: z.number().int(),
  version: z.number().int(),
  createdAt: instant,
  updatedAt: instant,
});
export type Label = Wire<typeof labelSchema>;
