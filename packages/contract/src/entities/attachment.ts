import { z } from 'zod';
import { id, instant, type Wire } from '../common.js';

/**
 * A file on a task or comment. The bytes come from GET
 * /attachments/:id/download; the storage key stays on the server.
 */
export const attachmentSchema = z.object({
  id,
  filename: z.string(),
  mimeType: z.string(),
  /** Bytes. */
  size: z.number().int(),
  taskId: id.nullable(),
  commentId: id.nullable(),
  uploadedById: id,
  createdAt: instant,
  uploadedBy: z.object({ id, name: z.string(), avatarUrl: z.string().nullable() }),
});
export type Attachment = Wire<typeof attachmentSchema>;

/** GET /attachments/limits: what an upload must satisfy. */
export const attachmentLimitsSchema = z.object({
  maxFileSizeMb: z.number(),
  allowedMimeTypes: z.array(z.string()),
});
export type AttachmentLimits = Wire<typeof attachmentLimitsSchema>;
