import { z } from 'zod';
import { pageQuery } from '../common.js';

export const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment content is required').max(10000),
  parentId: z.string().optional(),
});

export const updateCommentSchema = z.object({
  content: z.string().min(1, 'Comment content is required').max(10000),
});

export const commentParamsSchema = z.object({
  id: z.string().min(1, 'Comment ID is required'),
});

export const commentQuerySchema = pageQuery(100);

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type CommentParams = z.infer<typeof commentParamsSchema>;
export type CommentQuery = z.infer<typeof commentQuerySchema>;
