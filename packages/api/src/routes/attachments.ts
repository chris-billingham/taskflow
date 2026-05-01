import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import {
  attachmentParamsSchema,
  taskAttachmentParamsSchema,
  commentAttachmentParamsSchema,
} from '../schemas/attachment.js';
import * as fileService from '../services/fileService.js';
import { ValidationError } from '../errors/index.js';
import { env } from '../config/env.js';

export async function attachmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // POST /api/v1/tasks/:taskId/attachments - Upload and attach to task
  app.post('/tasks/:taskId/attachments', async (request, reply) => {
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
  app.post('/comments/:commentId/attachments', async (request, reply) => {
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

  // GET /api/v1/attachments/:id/download - Get signed download URL
  app.get('/attachments/:id/download', async (request, reply) => {
    const params = attachmentParamsSchema.safeParse(request.params);
    if (!params.success) throw new ValidationError(params.error.issues[0].message);

    const signedUrl = await fileService.getSignedDownloadUrl(params.data.id, request.user.id);
    return reply.send({ success: true, data: { signedUrl } });
  });

  // DELETE /api/v1/attachments/:id - Delete attachment
  app.delete('/attachments/:id', async (request, reply) => {
    const params = attachmentParamsSchema.safeParse(request.params);
    if (!params.success) throw new ValidationError(params.error.issues[0].message);

    const result = await fileService.deleteFile(params.data.id, request.user.id);
    return reply.send({ success: true, ...result });
  });
}
