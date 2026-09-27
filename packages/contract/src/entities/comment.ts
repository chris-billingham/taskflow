import { z } from 'zod';
import { id, instant, type Wire } from '../common.js';
import { userSummarySchema } from './user.js';

const commentFields = z.object({
  id,
  /** Markdown. */
  content: z.string(),
  authorId: id,
  taskId: id.nullable(),
  projectId: id.nullable(),
  parentId: id.nullable(),
  createdAt: instant,
  updatedAt: instant,
  author: userSummarySchema,
});

/** A top-level comment with its replies (one level deep). */
export const commentSchema = commentFields.extend({
  replies: z.array(commentFields),
});
export type Comment = Wire<typeof commentSchema>;
