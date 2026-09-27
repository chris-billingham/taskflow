import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  attachmentParamsSchema,
  taskAttachmentParamsSchema,
  commentAttachmentParamsSchema,
  attachmentSchema,
  attachmentLimitsSchema,
  messageResponse,
  ok,
  ALLOWED_MIME_TYPES,
} from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import * as fileService from '../services/fileService.js';
import { ValidationError } from '../errors/index.js';
import { env } from '../config/env.js';
import { rateLimitMax } from '../config/rateLimits.js';

const tags = ['Attachments'];

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

/** Read the single multipart file part, enforcing the size limit. */
async function readUpload(request: FastifyRequest) {
  const part = await request.file();
  if (!part) throw new ValidationError('No file provided');

  const buf = await part.toBuffer();
  if (buf.length === 0) throw new ValidationError('File is empty');
  if (buf.length > env.MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw new ValidationError(`File exceeds the ${env.MAX_FILE_SIZE_MB}MB size limit`);
  }
  return { buf, filename: part.filename, mimetype: part.mimetype };
}

export async function attachmentRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  // The web app validates uploads before sending them, and used to do so
  // against its own hardcoded 25MB constant; serving the real limits keeps
  // the two ends from drifting.
  app.get(
    '/attachments/limits',
    {
      schema: {
        tags,
        summary: 'Upload size limit and accepted file types',
        response: { 200: ok(attachmentLimitsSchema) },
      },
    },
    async () => ({
      success: true as const,
      data: { maxFileSizeMb: env.MAX_FILE_SIZE_MB, allowedMimeTypes: [...ALLOWED_MIME_TYPES] },
    }),
  );

  // Uploads are the most expensive thing a single request can do (25MB to
  // object storage) — give them their own budget.
  const uploadLimit = { rateLimit: { max: rateLimitMax(60), timeWindow: '10 minutes' } };

  app.post(
    '/tasks/:taskId/attachments',
    {
      config: uploadLimit,
      schema: {
        tags,
        summary: 'Upload a file to a task (multipart/form-data, field "file")',
        consumes: ['multipart/form-data'],
        params: taskAttachmentParamsSchema,
        response: { 201: ok(attachmentSchema) },
      },
    },
    async (request, reply) => {
      const { buf, filename, mimetype } = await readUpload(request);
      const data = await fileService.uploadFile(buf, filename, mimetype, request.user.id, request.params.taskId);
      return reply.status(201).send({ success: true, data });
    },
  );

  app.get(
    '/tasks/:taskId/attachments',
    {
      schema: {
        tags,
        summary: "A task's attachments",
        params: taskAttachmentParamsSchema,
        response: { 200: ok(z.array(attachmentSchema)) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await fileService.getTaskAttachments(request.params.taskId, request.user.id),
    }),
  );

  app.post(
    '/comments/:commentId/attachments',
    {
      config: uploadLimit,
      schema: {
        tags,
        summary: 'Upload a file to a comment (multipart/form-data, field "file")',
        consumes: ['multipart/form-data'],
        params: commentAttachmentParamsSchema,
        response: { 201: ok(attachmentSchema) },
      },
    },
    async (request, reply) => {
      const { buf, filename, mimetype } = await readUpload(request);
      const data = await fileService.uploadFile(
        buf,
        filename,
        mimetype,
        request.user.id,
        undefined,
        request.params.commentId,
      );
      return reply.status(201).send({ success: true, data });
    },
  );

  app.get(
    '/comments/:commentId/attachments',
    {
      schema: {
        tags,
        summary: "A comment's attachments",
        params: commentAttachmentParamsSchema,
        response: { 200: ok(z.array(attachmentSchema)) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await fileService.getCommentAttachments(request.params.commentId, request.user.id),
    }),
  );

  // Proxied through the API because the S3 endpoint is internal-only in the
  // shipped deployment, and because streaming lets us force safe download
  // semantics (attachment disposition + nosniff) on user-uploaded content.
  // `?inline=1` renders in-browser, permitted only for the image allowlist
  // (which excludes SVG) — everything else always downloads.
  app.get(
    '/attachments/:id/download',
    {
      schema: {
        tags,
        summary: "Download a file's bytes (inline=1 displays images in the browser)",
        params: attachmentParamsSchema,
        querystring: z.object({ inline: z.enum(['1']).optional() }),
      },
    },
    async (request, reply) => {
      const { attachment, body, contentLength } = await fileService.getDownloadStream(
        request.params.id,
        request.user.id,
      );
      const inline = request.query.inline === '1' && attachment.mimeType.startsWith('image/');

      reply
        .header('Content-Type', attachment.mimeType)
        .header('Content-Disposition', contentDisposition(attachment.filename, inline))
        .header('X-Content-Type-Options', 'nosniff')
        .header('Cache-Control', 'private, no-store');
      if (contentLength !== undefined) {
        reply.header('Content-Length', contentLength);
      }
      return reply.send(body);
    },
  );

  app.delete(
    '/attachments/:id',
    {
      schema: { tags, summary: 'Delete an attachment', params: attachmentParamsSchema, response: { 200: messageResponse } },
    },
    async (request) => ({
      success: true as const,
      ...(await fileService.deleteFile(request.params.id, request.user.id)),
    }),
  );
}
