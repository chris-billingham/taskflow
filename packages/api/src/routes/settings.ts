import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  updateProfileSchema,
  updateNotificationPreferencesSchema,
  notificationPreferencesSchema,
  profileSchema,
  messageResponse,
  deleteAccountSchema,
  importSummarySchema,
  ok,
} from '@taskflow/contract';
import { z } from 'zod';
import { env } from '../config/env.js';
import { rateLimitMax } from '../config/rateLimits.js';
import { ValidationError } from '../errors/index.js';
import { buildExport, exportZipStream } from '../services/portability/exporter.js';
import { importFile } from '../services/portability/importer.js';
import * as notificationService from '../services/notificationService.js';
import { authenticate } from '../middleware/authenticate.js';
import * as userService from '../services/userService.js';

const tags = ['Account'];

export async function settingsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.patch(
    '/preferences',
    {
      schema: {
        tags,
        summary: 'Update your preferences (same fields as PATCH /users/me)',
        body: updateProfileSchema,
        response: { 200: ok(profileSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await userService.updateUser(request.user.id, request.body),
    }),
  );

  app.get(
    '/notifications',
    {
      schema: { tags, summary: 'Your notification preferences', response: { 200: ok(notificationPreferencesSchema) } },
    },
    async (request) => ({
      success: true as const,
      data: await notificationService.getNotificationPreferences(request.user.id),
    }),
  );

  app.put(
    '/notifications',
    {
      schema: {
        tags,
        summary: 'Update your notification preferences',
        body: updateNotificationPreferencesSchema,
        response: { 200: ok(notificationPreferencesSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await notificationService.updateNotificationPreferences(request.user.id, request.body),
    }),
  );

  // A download of everything you own, in the Taskflow export format: a ZIP
  // of export.json and the attachments' files, or with ?format=json just
  // the document. It's an export format, not part of the API contract.
  app.get(
    '/export',
    {
      schema: {
        tags,
        summary: 'Download your data (a ZIP with attachments, or ?format=json)',
        querystring: z.object({ format: z.enum(['zip', 'json']).default('zip') }),
      },
    },
    async (request, reply) => {
      const stamp = new Date().toISOString().slice(0, 10);
      if (request.query.format === 'json') {
        const { document } = await buildExport(request.user.id);
        return reply
          .header('Content-Disposition', `attachment; filename="taskflow-export-${stamp}.json"`)
          .type('application/json')
          .send(document);
      }
      return reply
        .header('Content-Disposition', `attachment; filename="taskflow-export-${stamp}.zip"`)
        .type('application/zip')
        .send(await exportZipStream(request.user.id));
    },
  );

  app.post(
    '/import',
    {
      config: { rateLimit: { max: rateLimitMax(10), timeWindow: '1 hour' } },
      schema: {
        tags,
        summary: 'Import a Taskflow export, a Todoist CSV or backup, or a CSV (multipart, field "file")',
        consumes: ['multipart/form-data'],
        response: { 200: ok(importSummarySchema) },
      },
    },
    async (request) => {
      const limit = env.IMPORT_MAX_SIZE_MB * 1024 * 1024;
      const part = await request.file({ limits: { fileSize: limit } });
      if (!part) throw new ValidationError('Choose a file to import');
      const buf = await part.toBuffer();
      if (part.file.truncated) throw new ValidationError(`Imports can be up to ${env.IMPORT_MAX_SIZE_MB}MB`);
      if (buf.length === 0) throw new ValidationError('That file is empty');
      return { success: true as const, data: await importFile(request.user.id, part.filename, buf) };
    },
  );

  app.delete(
    '/data',
    {
      config: { sessionOnly: true },
      schema: {
        tags,
        summary: 'Delete your account and data (needs your password)',
        body: deleteAccountSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => {
      await userService.confirmPassword(request.user.id, request.body.password);
      return { success: true as const, ...(await userService.deleteUser(request.user.id)) };
    },
  );
}
