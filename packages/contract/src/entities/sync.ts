import { z } from 'zod';
import { id, instant, ok, type Wire } from '../common.js';
import { projectFieldsSchema, sectionSchema } from './project.js';
import { taskFieldsSchema } from './task.js';
import { labelSchema } from './label.js';

/**
 * GET /sync?since=<cursor>: what changed since the cursor a previous call
 * returned (or, without one, everything). Apply it, then store `cursor`.
 *
 * - Rows are full and idempotent: the same row may arrive twice; upsert by id.
 * - `deleted` lists ids to drop.
 * - `projectIds` is every project you can see right now. Drop projects not in
 *   it, and their sections and tasks (except tasks assigned to you).
 * - `reset: true` means your cursor is too old: drop everything first.
 */
export const syncTaskSchema = taskFieldsSchema.extend({
  labelIds: z.array(id),
  /** Set when the task is in the trash. */
  deletedAt: instant.nullable(),
});

export const syncSchema = z.object({
  cursor: z.string(),
  reset: z.boolean(),
  projectIds: z.array(id),
  projects: z.array(projectFieldsSchema),
  sections: z.array(sectionSchema),
  tasks: z.array(syncTaskSchema),
  labels: z.array(labelSchema),
  deleted: z.object({
    projects: z.array(id),
    sections: z.array(id),
    tasks: z.array(id),
    labels: z.array(id),
  }),
});
export type SyncPayload = Wire<typeof syncSchema>;
export const syncResponse = ok(syncSchema);

export const syncQuerySchema = z.object({
  since: z.string().regex(/^\d+$/, 'since must be a cursor from a previous sync').optional(),
});
