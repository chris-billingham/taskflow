import { z } from 'zod';

/**
 * The Taskflow export format (version 1): export.json inside the export ZIP,
 * with each attachment's file under attachments/. Importing it creates new
 * projects; IDs are references within the file, not database IDs.
 */

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ref = z.string().min(1).max(100);

const attachmentEntry = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  size: z.number().int().nonnegative(),
  /** The file's path inside the ZIP. */
  path: z.string().min(1).max(500),
});

const commentEntry = z.object({
  content: z.string().max(20_000),
  author: z.string().max(320).nullable().optional(),
  createdAt: z.string().optional(),
  attachments: z.array(attachmentEntry).default([]),
});

const taskEntry = z.object({
  ref,
  content: z.string().min(1).max(2000),
  description: z.string().max(20_000).nullable().optional(),
  sectionRef: ref.nullable().optional(),
  parentRef: ref.nullable().optional(),
  dueDate: date.nullable().optional(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  duration: z.number().int().positive().nullable().optional(),
  deadline: date.nullable().optional(),
  recurrenceRule: z.string().max(500).nullable().optional(),
  priority: z.number().int().min(1).max(4).default(4),
  isCompleted: z.boolean().default(false),
  completedAt: z.string().nullable().optional(),
  labels: z.array(z.string().min(1).max(100)).default([]),
  /** Email of who it was assigned to, kept only if that's the importer. */
  assignee: z.string().max(320).nullable().optional(),
  createdAt: z.string().optional(),
  comments: z.array(commentEntry).default([]),
  attachments: z.array(attachmentEntry).default([]),
});

const projectEntry = z.object({
  ref,
  name: z.string().min(1).max(200),
  color: z.string().max(20).optional(),
  description: z.string().max(20_000).nullable().optional(),
  viewStyle: z.enum(['LIST', 'BOARD', 'CALENDAR']).optional(),
  isArchived: z.boolean().default(false),
  /** The Inbox imports into the importer's own Inbox. */
  isInbox: z.boolean().default(false),
  parentRef: ref.nullable().optional(),
  sections: z.array(z.object({ ref, name: z.string().min(1).max(200) })).default([]),
  tasks: z.array(taskEntry).default([]),
});

export const exportDocumentSchema = z.object({
  format: z.literal('taskflow-export'),
  version: z.literal(1),
  exportedAt: z.string(),
  labels: z.array(z.object({ name: z.string().min(1).max(100), color: z.string().max(20).optional() })).default([]),
  filters: z
    .array(z.object({ name: z.string().min(1).max(100), query: z.string().max(1000), color: z.string().max(20).optional() }))
    .default([]),
  projects: z.array(projectEntry).default([]),
  /** Your recent activity, for the record; not imported. */
  activity: z
    .array(z.object({ action: z.string(), entityType: z.string(), entityId: z.string(), createdAt: z.string() }))
    .default([]),
});

export type ExportDocument = z.infer<typeof exportDocumentSchema>;
export type ExportProject = z.infer<typeof projectEntry>;
export type ExportTask = z.infer<typeof taskEntry>;
export type ExportAttachment = z.infer<typeof attachmentEntry>;
