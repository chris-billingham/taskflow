import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  changePasswordSchema,
  updateProfileSchema,
  meSchema,
  profileSchema,
  messageResponse,
  deleteAccountSchema,
  ok,
} from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import * as userService from '../services/userService.js';

const tags = ['Account'];

export async function userRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.get(
    '/me',
    { schema: { tags, summary: 'Your profile and workspaces', response: { 200: ok(meSchema) } } },
    async (request) => ({ success: true as const, data: await userService.getUserById(request.user.id) }),
  );

  app.patch(
    '/me',
    {
      schema: { tags, summary: 'Update your profile', body: updateProfileSchema, response: { 200: ok(profileSchema) } },
    },
    async (request) => ({
      success: true as const,
      data: await userService.updateUser(request.user.id, request.body),
    }),
  );

  app.patch(
    '/me/password',
    {
      config: { sessionOnly: true },
      schema: {
        tags,
        summary: 'Change your password (signs out your other sessions)',
        body: changePasswordSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await userService.changePassword(
        request.user.id,
        request.body.currentPassword,
        request.body.newPassword,
      )),
    }),
  );

  app.delete(
    '/me',
    {
      config: { sessionOnly: true },
      schema: { tags, summary: 'Delete your account (needs your password)', body: deleteAccountSchema, response: { 200: messageResponse } },
    },
    async (request) => {
      await userService.confirmPassword(request.user.id, request.body.password);
      return { success: true as const, ...(await userService.deleteUser(request.user.id)) };
    },
  );
}
