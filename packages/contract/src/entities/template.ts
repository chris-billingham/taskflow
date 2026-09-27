import { z } from 'zod';
import { id, instant, type Wire } from '../common.js';

const templateSubtaskSchema = z.object({
  content: z.string(),
  description: z.string().optional(),
  priority: z.number().int(),
  /** Label names; matched to (or created as) the applier's own labels. */
  labels: z.array(z.string()),
  sortOrder: z.number().int(),
});

/** A template body: the project, its sections and tasks, stored as JSON. */
export const templateDataSchema = z.object({
  project: z.object({ name: z.string(), color: z.string(), viewStyle: z.string() }),
  sections: z.array(z.object({ name: z.string(), sortOrder: z.number().int() })),
  tasks: z.array(
    templateSubtaskSchema.extend({
      /** Index into `sections`; absent for tasks outside any section. */
      sectionIndex: z.number().int().optional(),
      subtasks: z.array(templateSubtaskSchema),
    }),
  ),
});
export type TemplateData = Wire<typeof templateDataSchema>;

export const templateSchema = z.object({
  id,
  name: z.string(),
  description: z.string().nullable(),
  data: templateDataSchema,
  /** Null for built-in templates. */
  userId: id.nullable(),
  workspaceId: id.nullable(),
  /** Built-in templates only; users can't publish to the gallery. */
  isPublic: z.boolean(),
  createdAt: instant,
  updatedAt: instant,
  user: z.object({ id, name: z.string(), avatarUrl: z.string().nullable() }).nullable(),
});
export type Template = Wire<typeof templateSchema>;
