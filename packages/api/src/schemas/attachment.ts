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

export const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text
  'text/plain',
  'text/csv',
  'text/markdown',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/x-tar',
  'application/gzip',
  // Data
  'application/json',
]);

export type AttachmentParams = z.infer<typeof attachmentParamsSchema>;
