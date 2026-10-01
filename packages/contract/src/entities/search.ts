import { z } from 'zod';
import { calendarDate, id, type Wire } from '../common.js';

export const taskSearchResultSchema = z.object({
  type: z.literal('task'),
  id,
  content: z.string(),
  description: z.string().nullable(),
  projectId: id,
  projectName: z.string(),
  projectColor: z.string(),
  dueDate: calendarDate.nullable(),
  isCompleted: z.boolean(),
  priority: z.number().int(),
  rank: z.number(),
});

export const projectSearchResultSchema = z.object({
  type: z.literal('project'),
  id,
  name: z.string(),
  color: z.string(),
  taskCount: z.number().int(),
  rank: z.number(),
});

export const commentSearchResultSchema = z.object({
  type: z.literal('comment'),
  id,
  content: z.string(),
  taskId: id.nullable(),
  taskContent: z.string().nullable(),
  projectId: id.nullable(),
  projectName: z.string().nullable(),
  rank: z.number(),
});

export const searchResultsSchema = z.object({
  tasks: z.array(taskSearchResultSchema),
  projects: z.array(projectSearchResultSchema),
  comments: z.array(commentSearchResultSchema),
});
export type SearchResults = Wire<typeof searchResultsSchema>;
