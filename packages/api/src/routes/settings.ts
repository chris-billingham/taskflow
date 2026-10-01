import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  updateProfileSchema,
  updateNotificationPreferencesSchema,
  notificationPreferencesSchema,
  profileSchema,
  messageResponse,
  deleteAccountSchema,
  ok,
} from '@taskflow/contract';
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

  // A JSON download of everything you own; its shape is an export format,
  // not part of the API contract.
  app.get(
    '/export',
    { schema: { tags, summary: 'Download your data as JSON' } },
    async (request, reply) => {
      const data = await userService.exportUserData(request.user.id);
      return reply
        .header('Content-Disposition', `attachment; filename="taskflow-export-${Date.now()}.json"`)
        .header('Content-Type', 'application/json')
        .send(data);
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
