import { z } from 'zod';
import { calendarDate, id, instant, type Wire } from '../common.js';
import { labelSchema } from './label.js';
import { userSummarySchema } from './user.js';

export const taskLabelSchema = z.object({
  taskId: id,
  labelId: id,
  // What a task shows of its labels; favourite and order are each person's own.
  label: labelSchema.pick({ id: true, name: true, color: true, userId: true, workspaceId: true }),
});

/** A task's own columns. */
export const taskFieldsSchema = z.object({
  id,
  content: z.string(),
  description: z.string().nullable(),
  projectId: id,
  sectionId: id.nullable(),
  parentId: id.nullable(),
  /** Null once the creator's account is deleted; the task survives. */
  creatorId: id.nullable(),
  assigneeId: id.nullable(),
  /** A calendar date, sent as UTC midnight. */
  dueDate: calendarDate.nullable(),
  /** Wall-clock HH:mm in the viewer's timezone. */
  dueTime: z.string().nullable(),
  deadline: calendarDate.nullable(),
  /** Minutes. */
  duration: z.number().int().nullable(),
  isRecurring: z.boolean(),
  recurrenceRule: z.string().nullable(),
  /** 1 (highest) to 4 (lowest). */
  priority: z.number().int(),
  isCompleted: z.boolean(),
  completedAt: instant.nullable(),
  sortOrder: z.number().int(),
  createdAt: instant,
  updatedAt: instant,
});

/** A subtask as embedded in its parent. */
export const subtaskSchema = taskFieldsSchema.extend({
  taskLabels: z.array(taskLabelSchema),
  assignee: userSummarySchema.nullable(),
});
export type Subtask = Wire<typeof subtaskSchema>;

/** A task in a list (project, filter, label): no nested subtasks. */
export const taskListItemSchema = subtaskSchema.extend({
  _count: z.object({ subtasks: z.number().int(), comments: z.number().int() }),
});
export type TaskListItem = Wire<typeof taskListItemSchema>;

/** A task with its subtasks, as mutations and views return it. */
export const taskSchema = taskListItemSchema.extend({
  subtasks: z.array(subtaskSchema),
});
export type Task = Wire<typeof taskSchema>;

/** A comment as previewed in the task panel. */
export const taskCommentPreviewSchema = z.object({
  id,
  content: z.string(),
  authorId: id,
  taskId: id.nullable(),
  parentId: id.nullable(),
  createdAt: instant,
  updatedAt: instant,
  author: z.object({ id, name: z.string(), avatarUrl: z.string().nullable() }),
});

/** GET /tasks/:id: the task plus where it lives and its latest comments. */
export const taskDetailSchema = taskSchema.extend({
  project: z.object({ id, name: z.string(), color: z.string() }),
  section: z.object({ id, name: z.string() }).nullable(),
  parent: z.object({ id, content: z.string() }).nullable(),
  /** The 20 most recent, newest first. */
  comments: z.array(taskCommentPreviewSchema),
});
export type TaskDetail = Wire<typeof taskDetailSchema>;

/** GET /tasks/trash: a trashed task and where it came from. */
export const trashedTaskSchema = taskFieldsSchema.extend({
  project: z.object({ id, name: z.string(), color: z.string() }),
  deletedAt: instant,
  /** When the maintenance job will delete it for good. */
  purgeAt: instant,
});
export type TrashedTask = Wire<typeof trashedTaskSchema>;

/** POST /tasks/bulk. */
export const bulkResultSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  count: z.number().int(),
});
