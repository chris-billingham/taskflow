import { z } from 'zod';
import { isSupportedRecurrence } from '../logic/recurrence.js';
import { calendarDateInput, pageQuery } from '../common.js';

/** A recurrence rule the server can advance (see logic/recurrence.ts). */
export const recurrenceRuleSchema = z
  .string()
  .max(200)
  .refine(
    isSupportedRecurrence,
    'Unsupported recurrence rule: use FREQ=DAILY|WEEKLY|MONTHLY|YEARLY with optional INTERVAL, BYDAY, COUNT and UNTIL',
  );

export const createTaskSchema = z.object({
  content: z.string().min(1, 'Task content is required').max(500),
  description: z.string().max(10000).optional(),
  projectId: z.string().min(1, 'Project ID is required'),
  sectionId: z.string().optional(),
  parentId: z.string().optional(),
  dueDate: calendarDateInput.optional(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:mm format').optional(),
  deadline: calendarDateInput.optional(),
  duration: z.number().int().min(1).max(1440).optional(), // in minutes
  priority: z.number().int().min(1).max(4).optional(),
  assigneeId: z.string().optional(),
  labelIds: z.array(z.string()).optional(),
  isRecurring: z.boolean().optional(),
  recurrenceRule: recurrenceRuleSchema.optional(),
});

export const updateTaskSchema = z.object({
  content: z.string().min(1, 'Task content is required').max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  sectionId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  dueDate: calendarDateInput.nullable().optional(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:mm format').nullable().optional(),
  deadline: calendarDateInput.nullable().optional(),
  duration: z.number().int().min(1).max(1440).nullable().optional(),
  priority: z.number().int().min(1).max(4).optional(),
  assigneeId: z.string().nullable().optional(),
  labelIds: z.array(z.string()).optional(),
  isRecurring: z.boolean().optional(),
  recurrenceRule: recurrenceRuleSchema.nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const taskParamsSchema = z.object({
  id: z.string().min(1, 'Task ID is required'),
});

/** Nested task routes: /tasks/:taskId/comments, /reminders, /attachments. */
export const taskIdParamsSchema = z.object({
  taskId: z.string().min(1, 'Task ID is required'),
});

// Cursor pagination: unbounded task lists serialised tens of thousands of
// rows on mature accounts (multi-second responses, container OOM).
export const taskQuerySchema = pageQuery(200).extend({
  projectId: z.string().optional(),
  sectionId: z.string().optional(),
  parentId: z.string().optional(),
  completed: z.enum(['true', 'false']).optional(),
  priority: z.string().optional(), // comma-separated: "1,2"
  assigneeId: z.string().optional(),
  labels: z.string().optional(), // comma-separated label IDs
  dueDateFrom: calendarDateInput.optional(),
  dueDateTo: calendarDateInput.optional(),
  search: z.string().optional(),
});

export const bulkTaskSchema = z.object({
  taskIds: z
    .array(z.string())
    .min(1, 'At least one task ID is required')
    .max(100, 'Bulk operations are limited to 100 tasks at a time'),
  action: z.enum([
    'complete',
    'uncomplete',
    'delete',
    /** Bring trashed tasks back (undoing a bulk delete). */
    'restore',
    'move',
    'updatePriority',
    /** data.dueDate: YYYY-MM-DD, or null to clear the date (and time). */
    'setDueDate',
    /** data.labelIds: your own labels to add or remove. */
    'addLabels',
    'removeLabels',
  ]),
  data: z.object({
    projectId: z.string().optional(),
    sectionId: z.string().nullable().optional(),
    priority: z.number().int().min(1).max(4).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD').nullable().optional(),
    labelIds: z.array(z.string()).max(50).optional(),
  }).optional(),
});

export const quickAddSchema = z.object({
  text: z.string().min(1, 'Text is required').max(500),
  projectId: z.string().optional(),
  // A date or time the caller already knows exactly (a calendar cell, an
  // Upcoming day). Overrides whatever the text parser finds, so the caller
  // never has to round-trip a date through words.
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD').optional(),
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'dueTime must be HH:mm').optional(),
  /**
   * Where the box sits (Today, an Upcoming day, a calendar cell): used only
   * when the text itself names no date or time, so typing "tomorrow" in
   * Today's box still means tomorrow.
   */
  defaultDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'defaultDueDate must be YYYY-MM-DD').optional(),
  defaultDueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'defaultDueTime must be HH:mm').optional(),
  /** The section the box was in; ignored if the text names another project. */
  sectionId: z.string().optional(),
});

export const moveTaskSchema = z.object({
  projectId: z.string().optional(),
  sectionId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
});

export const reorderTasksSchema = z.object({
  taskIds: z.array(z.string()).min(1, 'At least one task ID is required'),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskParams = z.infer<typeof taskParamsSchema>;
export type TaskQuery = z.infer<typeof taskQuerySchema>;
export type BulkTaskInput = z.infer<typeof bulkTaskSchema>;
export type QuickAddInput = z.infer<typeof quickAddSchema>;
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
export type ReorderTasksInput = z.infer<typeof reorderTasksSchema>;
