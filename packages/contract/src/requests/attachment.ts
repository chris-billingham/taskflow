import { z } from 'zod';

export const attachmentParamsSchema = z.object({
  id: z.string().min(1),
});

export const taskAttachmentParamsSchema = z.object({
  taskId: z.string().min(1),
});

export const commentAttachmentParamsSchema = z.object({
  commentId: z.string().min(1),
});


export type AttachmentParams = z.infer<typeof attachmentParamsSchema>;
