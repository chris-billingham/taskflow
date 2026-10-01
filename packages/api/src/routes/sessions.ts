import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  sessionSchema,
  sessionParamsSchema,
  apiTokenSchema,
  createdApiTokenSchema,
  createApiTokenSchema,
  messageResponse,
  ok,
} from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import * as sessionService from '../services/sessionService.js';

// Where you're signed in, and the personal access tokens you've made. All of
// it needs a real sign-in: an access token can't list or mint more tokens.
const config = { sessionOnly: true };

export async function sessionRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.get(
    '/sessions',
    {
      config,
      schema: { tags: ['Sessions'], summary: 'Devices you are signed in on', response: { 200: ok(z.array(sessionSchema)) } },
    },
    async (request) => ({
      success: true as const,
      data: await sessionService.listSessions(request.user.id, request.user.sid),
    }),
  );

  app.delete(
    '/sessions/:id',
    {
      config,
      schema: {
        tags: ['Sessions'],
        summary: 'Sign one device out',
        params: sessionParamsSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await sessionService.revokeSession(request.user.id, request.params.id)),
    }),
  );

  app.delete(
    '/sessions',
    {
      config,
      schema: { tags: ['Sessions'], summary: 'Sign out of every other device', response: { 200: messageResponse } },
    },
    async (request) => ({
      success: true as const,
      ...(await sessionService.revokeOtherSessions(request.user.id, request.user.sid)),
    }),
  );

  app.get(
    '/tokens',
    {
      config,
      schema: { tags: ['Access tokens'], summary: 'Your personal access tokens', response: { 200: ok(z.array(apiTokenSchema)) } },
    },
    async (request) => ({ success: true as const, data: await sessionService.listApiTokens(request.user.id) }),
  );

  app.post(
    '/tokens',
    {
      config,
      schema: {
        tags: ['Access tokens'],
        summary: 'Create a personal access token (the token is only returned this once)',
        body: createApiTokenSchema,
        response: { 201: ok(createdApiTokenSchema) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        success: true as const,
        data: await sessionService.createApiToken(request.user.id, request.body),
      }),
  );

  app.delete(
    '/tokens/:id',
    {
      config,
      schema: {
        tags: ['Access tokens'],
        summary: 'Revoke a personal access token',
        params: sessionParamsSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await sessionService.revokeApiToken(request.user.id, request.params.id)),
    }),
  );
}
