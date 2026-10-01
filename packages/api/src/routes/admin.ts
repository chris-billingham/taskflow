import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  listUsersQuerySchema,
  createUserSchema,
  setUserRoleSchema,
  setUserStatusSchema,
  adminResetPasswordSchema,
  updateInstanceSettingsSchema,
  adminUserParamsSchema,
  adminUserSchema,
  adminUserPageSchema,
  adminUserDetailSchema,
  adminStatsSchema,
  adminCreatedUserSchema,
  adminPasswordResetSchema,
  instanceSettingsSchema,
  messageResponse,
  ok,
} from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { requireSession } from '../middleware/requireSession.js';
import * as adminService from '../services/adminService.js';
import * as instanceSettings from '../services/instanceSettingsService.js';
import { rateLimitMax } from '../config/rateLimits.js';

const tags = ['Admin'];

/**
 * Instance administration. Every route here is gated by authenticate (valid
 * token) then requireAdmin (fresh database read of role + isActive).
 */
export async function adminRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requireSession);
  app.addHook('preHandler', requireAdmin);

  app.get(
    '/stats',
    { schema: { tags, summary: 'Account counts', response: { 200: ok(adminStatsSchema) } } },
    async () => ({ success: true as const, data: await adminService.getStats() }),
  );

  // Deployment-wide settings. Only sign-up policy for now.
  app.get(
    '/settings',
    { schema: { tags, summary: 'Instance settings', response: { 200: ok(instanceSettingsSchema) } } },
    async () => ({
      success: true as const,
      data: { registrationMode: await instanceSettings.getRegistrationMode() },
    }),
  );

  app.patch(
    '/settings',
    {
      schema: {
        tags,
        summary: 'Change instance settings',
        body: updateInstanceSettingsSchema,
        response: { 200: ok(instanceSettingsSchema) },
      },
    },
    async (request) => {
      const registrationMode = await instanceSettings.setRegistrationMode(
        request.body.registrationMode,
        request.user.id,
      );
      request.log.info({ registrationMode, adminId: request.user.id }, 'registration mode changed');
      return { success: true as const, data: { registrationMode } };
    },
  );

  app.get(
    '/users',
    {
      schema: {
        tags,
        summary: 'Search and page through accounts',
        querystring: listUsersQuerySchema,
        response: { 200: ok(adminUserPageSchema) },
      },
    },
    async (request) => ({ success: true as const, data: await adminService.listUsers(request.query) }),
  );

  app.get(
    '/users/:id',
    {
      schema: {
        tags,
        summary: 'An account with its workspaces and counts',
        params: adminUserParamsSchema,
        response: { 200: ok(adminUserDetailSchema) },
      },
    },
    async (request) => ({ success: true as const, data: await adminService.getUserDetail(request.params.id) }),
  );

  app.post(
    '/users',
    {
      config: { rateLimit: { max: rateLimitMax(30), timeWindow: '1 hour' } },
      schema: {
        tags,
        summary: 'Create an account (optionally with a generated password, shown once)',
        body: createUserSchema,
        response: { 201: ok(adminCreatedUserSchema) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({ success: true, data: await adminService.createUser(request.body) }),
  );

  app.patch(
    '/users/:id/role',
    {
      schema: {
        tags,
        summary: 'Make or revoke an admin',
        params: adminUserParamsSchema,
        body: setUserRoleSchema,
        response: { 200: ok(adminUserSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await adminService.setUserRole(request.params.id, request.body.role),
    }),
  );

  app.patch(
    '/users/:id/status',
    {
      schema: {
        tags,
        summary: 'Suspend or reactivate an account',
        params: adminUserParamsSchema,
        body: setUserStatusSchema,
        response: { 200: ok(adminUserSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await adminService.setUserActive(request.user.id, request.params.id, request.body.isActive),
    }),
  );

  app.post(
    '/users/:id/password',
    {
      config: { rateLimit: { max: rateLimitMax(20), timeWindow: '1 hour' } },
      schema: {
        tags,
        summary: "Reset an account's password and revoke its sessions",
        params: adminUserParamsSchema,
        body: adminResetPasswordSchema.optional(),
        response: { 200: ok(adminPasswordResetSchema) },
      },
    },
    // The generated password is in this response body and nowhere else — it
    // is never logged and cannot be retrieved again.
    async (request) => ({
      success: true as const,
      data: await adminService.resetUserPassword(request.params.id, request.body?.password),
    }),
  );

  app.delete(
    '/users/:id',
    {
      schema: { tags, summary: 'Delete an account', params: adminUserParamsSchema, response: { 200: messageResponse } },
    },
    async (request) => ({
      success: true as const,
      ...(await adminService.deleteUser(request.user.id, request.params.id)),
    }),
  );
}
