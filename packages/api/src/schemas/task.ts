import { z } from 'zod';

export const createTaskSchema = z.object({
  content: z.string().min(1, 'Task content is required').max(500),
  description: z.string().max(10000).optional(),
  projectId: z.string().min(1, 'Project ID is required'),
  sectionId: z.string().optional(),
  parentId: z.string().optional(),
  dueDate: z.string().optional(), // ISO date string
  dueTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:mm format').optional(),
  deadline: z.string().optional(), // ISO date string
  duration: z.number().int().min(1).max(1440).optional(), // in minutes
  priority: z.number().int().min(1).max(4).optional(),
  assigneeId: z.string().optional(),
  labelIds: z.array(z.string()).optional(),
  isRecurring: z.boolean().optional(),
  recurrenceRule: z.string().optional(),
});

export const updateTaskSchema = z.object({
  content: z.string().min(1, 'Task content is required').max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  sectionId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:mm format').nullable().optional(),
  deadline: z.string().nullable().optional(),
  duration: z.number().int().min(1).max(1440).nullable().optional(),
  priority: z.number().int().min(1).max(4).optional(),
  assigneeId: z.string().nullable().optional(),
  labelIds: z.array(z.string()).optional(),
  isRecurring: z.boolean().optional(),
  recurrenceRule: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const taskParamsSchema = z.object({
  id: z.string().min(1, 'Task ID is required'),
});

export const taskQuerySchema = z.object({
  projectId: z.string().optional(),
  sectionId: z.string().optional(),
  parentId: z.string().optional(),
  completed: z.enum(['true', 'false']).optional(),
  priority: z.string().optional(), // comma-separated: "1,2"
  assigneeId: z.string().optional(),
  labels: z.string().optional(), // comma-separated label IDs
  dueDateFrom: z.string().optional(),
  dueDateTo: z.string().optional(),
  search: z.string().optional(),
});

export const bulkTaskSchema = z.object({
  taskIds: z
    .array(z.string())
    .min(1, 'At least one task ID is required')
    .max(100, 'Bulk operations are limited to 100 tasks at a time'),
  action: z.enum(['complete', 'uncomplete', 'delete', 'move', 'updatePriority']),
  data: z.object({
    projectId: z.string().optional(),
    sectionId: z.string().nullable().optional(),
    priority: z.number().int().min(1).max(4).optional(),
  }).optional(),
});

export const quickAddSchema = z.object({
  text: z.string().min(1, 'Text is required').max(500),
  projectId: z.string().optional(),
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
