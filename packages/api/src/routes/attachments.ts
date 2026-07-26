import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import {
  attachmentParamsSchema,
  taskAttachmentParamsSchema,
  commentAttachmentParamsSchema,
  ALLOWED_MIME_TYPES,
} from '../schemas/attachment.js';
import * as fileService from '../services/fileService.js';
import { ValidationError } from '../errors/index.js';
import { env } from '../config/env.js';

/**
 * Build a Content-Disposition header for an untrusted filename: an ASCII-safe
 * fallback (quotes/control chars stripped so the header can't be broken out
 * of) plus the RFC 5987 UTF-8 form for browsers that support it.
 */
export function contentDisposition(filename: string, inline: boolean): string {
  const fallback =
    filename.replace(/[^\x20-\x7e]+/g, '_').replace(/["\\]/g, '_') || 'download';
  const encoded = encodeURIComponent(filename);
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function attachmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/v1/attachments/limits — the web app validates uploads before
  // sending them, and used to do so against its own hardcoded 25MB constant.
  // Raising MAX_FILE_SIZE_MB server-side then had no effect: the browser
  // still refused the file and the hint still read "Max 25MB". Serving the
  // real limits keeps the two ends from drifting.
  app.get('/attachments/limits', async (_request, reply) => {
    return reply.send({
      success: true,
      data: {
        maxFileSizeMb: env.MAX_FILE_SIZE_MB,
        allowedMimeTypes: [...ALLOWED_MIME_TYPES],
      },
    });
  });

  // Uploads are the most expensive thing a single request can do (25MB to
  // object storage) — give them their own budget.
  const uploadLimit = {
    config: {
      rateLimit: { max: env.NODE_ENV === 'production' ? 60 : 1000, timeWindow: '10 minutes' },
    },
  };

  // POST /api/v1/tasks/:taskId/attachments - Upload and attach to task
  app.post('/tasks/:taskId/attachments', uploadLimit, async (request, reply) => {
    const params = taskAttachmentParamsSchema.safeParse(request.params);
    if (!params.success) throw new ValidationError(params.error.issues[0].message);

    const part = await (request as any).file();
    if (!part) throw new ValidationError('No file provided');

    const buf: Buffer = await part.toBuffer();
    if (buf.length === 0) throw new ValidationError('File is empty');
    if (buf.length > env.MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new ValidationError(`File exceeds the ${env.MAX_FILE_SIZE_MB}MB size limit`);
    }

    const data = await fileService.uploadFile(
      buf,
      part.filename,
      part.mimetype,
      request.user.id,
      params.data.taskId,
    );
    return reply.status(201).send({ success: true, data });
  });

  // GET /api/v1/tasks/:taskId/attachments - List task attachments
  app.get('/tasks/:taskId/attachments', async (request, reply) => {
    const params = taskAttachmentParamsSchema.safeParse(request.params);
    if (!params.success) throw new ValidationError(params.error.issues[0].message);

    const data = await fileService.getTaskAttachments(params.data.taskId, request.user.id);
    return reply.send({ success: true, data });
  });

  // POST /api/v1/comments/:commentId/attachments - Upload and attach to comment
  app.post('/comments/:commentId/attachments', uploadLimit, async (request, reply) => {
    const params = commentAttachmentParamsSchema.safeParse(request.params);
    if (!params.success) throw new ValidationError(params.error.issues[0].message);

    const part = await (request as any).file();
    if (!part) throw new ValidationError('No file provided');

    const buf: Buffer = await part.toBuffer();
    if (buf.length === 0) throw new ValidationError('File is empty');
    if (buf.length > env.MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new ValidationError(`File exceeds the ${env.MAX_FILE_SIZE_MB}MB size limit`);
    }

    const data = await fileService.uploadFile(
      buf,
      part.filename,
      part.mimetype,
      request.user.id,
      undefined,
      params.data.commentId,
    );
    return reply.status(201).send({ success: true, data });
  });

  // GET /api/v1/comments/:commentId/attachments - List comment attachments
  app.get('/comments/:commentId/attachments', async (request, reply) => {
    const params = commentAttachmentParamsSchema.safeParse(request.params);
    if (!params.success) throw new ValidationError(params.error.issues[0].message);

    const data = await fileService.getCommentAttachments(
      params.data.commentId,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // GET /api/v1/attachments/:id/download - Stream the file content.
  // Proxied through the API because the S3 endpoint is internal-only in the
  // shipped deployment, and because streaming lets us force safe download
  // semantics (attachment disposition + nosniff) on user-uploaded content.
  // `?inline=1` renders in-browser, permitted only for the image allowlist
  // (which excludes SVG) — everything else always downloads.
  app.get('/attachments/:id/download', async (request, reply) => {
    const params = attachmentParamsSchema.safeParse(request.params);
    if (!params.success) throw new ValidationError(params.error.issues[0].message);

    const { attachment, body, contentLength } = await fileService.getDownloadStream(
      params.data.id,
      request.user.id,
    );

    const wantsInline = (request.query as { inline?: string }).inline === '1';
    const inline = wantsInline && attachment.mimeType.startsWith('image/');

    reply
      .header('Content-Type', attachment.mimeType)
      .header('Content-Disposition', contentDisposition(attachment.filename, inline))
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'private, no-store');
    if (contentLength !== undefined) {
      reply.header('Content-Length', contentLength);
    }
    return reply.send(body);
  });

  // DELETE /api/v1/attachments/:id - Delete attachment
  app.delete('/attachments/:id', async (request, reply) => {
    const params = attachmentParamsSchema.safeParse(request.params);
    if (!params.success) throw new ValidationError(params.error.issues[0].message);

    const result = await fileService.deleteFile(params.data.id, request.user.id);
    return reply.send({ success: true, ...result });
  });
}
