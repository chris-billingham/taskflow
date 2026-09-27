import { z } from 'zod';
import { id, instant, type Wire } from '../common.js';
import { viewStyleSchema } from './project.js';
import { taskFieldsSchema } from './task.js';
import { userSummarySchema } from './user.js';

export const filterSchema = z.object({
  id,
  name: z.string(),
  /** A query in the filter language, e.g. "today & p1 & @work". */
  query: z.string(),
  color: z.string(),
  userId: id,
  isFavorite: z.boolean(),
  sortOrder: z.number().int(),
  viewStyle: viewStyleSchema,
  createdAt: instant,
  updatedAt: instant,
});
export type Filter = Wire<typeof filterSchema>;

/** A task matched by a filter query: carries where it lives. */
export const filterTaskSchema = taskFieldsSchema.extend({
  taskLabels: z.array(
    z.object({
      taskId: id,
      labelId: id,
      label: z.object({ id, name: z.string(), color: z.string() }),
    }),
  ),
  assignee: userSummarySchema.nullable(),
  project: z.object({ id, name: z.string(), color: z.string() }),
  section: z.object({ id, name: z.string() }).nullable(),
  _count: z.object({ subtasks: z.number().int(), comments: z.number().int() }),
});
export type FilterTask = Wire<typeof filterTaskSchema>;

/** POST /filters/validate. */
export const filterValidationSchema = z.object({
  valid: z.boolean(),
  error: z.string().optional(),
});
export type FilterValidation = Wire<typeof filterValidationSchema>;
