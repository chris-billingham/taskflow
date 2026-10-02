import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  calendarFeedSchema,
  createCalendarFeedSchema,
  webhookSchema,
  webhookWithSecretSchema,
  createWebhookSchema,
  updateWebhookSchema,
  integrationParamsSchema,
  calendarFileParamsSchema,
  projectParamsSchema,
  messageResponse,
  ok,
} from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import * as calendarFeeds from '../services/calendarFeeds.js';
import * as webhooks from '../services/webhooks.js';
import { rateLimitMax } from '../config/rateLimits.js';

/**
 * GET /calendar/<token>.ics: the feed itself, for calendar apps. The token in
 * the URL is the credential, so no sign-in.
 */
export async function calendarFileRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.get(
    '/calendar/:file',
    {
      config: { rateLimit: { max: rateLimitMax(60), timeWindow: '1 minute' } },
      schema: {
        tags: ['Calendar feeds'],
        summary: 'A calendar feed (iCalendar), by its secret URL',
        security: [],
        params: calendarFileParamsSchema,
      },
    },
    async (request, reply) => {
      const token = request.params.file.replace(/\.ics$/, '');
      const ics = await calendarFeeds.renderFeed(token);
      if (!ics) return reply.status(404).send({ success: false, error: 'NOT_FOUND', message: 'Calendar feed not found' });
      return reply
        .type('text/calendar; charset=utf-8')
        .header('cache-control', 'private, max-age=300')
        .header('content-disposition', 'inline; filename="taskflow.ics"')
        .send(ics);
    },
  );
}

const feedTags = ['Calendar feeds'];
const webhookTags = ['Webhooks'];

export async function integrationRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.get(
    '/calendar-feeds',
    { schema: { tags: feedTags, summary: 'Your calendar feeds', response: { 200: ok(z.array(calendarFeedSchema)) } } },
    async (request) => ({ success: true as const, data: await calendarFeeds.listFeeds(request.user.id) }),
  );

  app.post(
    '/calendar-feeds',
    {
      // A feed URL is a lasting credential: only a real sign-in makes one.
      config: { sessionOnly: true },
      schema: {
        tags: feedTags,
        summary: "A project's or filter's calendar feed (made if there isn't one)",
        body: createCalendarFeedSchema,
        response: { 200: ok(calendarFeedSchema) },
      },
    },
    async (request) => ({ success: true as const, data: await calendarFeeds.getOrCreateFeed(request.user.id, request.body) }),
  );

  app.post(
    '/calendar-feeds/:id/reset',
    {
      config: { sessionOnly: true },
      schema: {
        tags: feedTags,
        summary: 'A new URL for a feed; the old one stops working',
        params: integrationParamsSchema,
        response: { 200: ok(calendarFeedSchema) },
      },
    },
    async (request) => ({ success: true as const, data: await calendarFeeds.resetFeed(request.user.id, request.params.id) }),
  );

  app.delete(
    '/calendar-feeds/:id',
    { schema: { tags: feedTags, summary: 'Remove a calendar feed', params: integrationParamsSchema, response: { 200: messageResponse } } },
    async (request) => ({ success: true as const, ...(await calendarFeeds.deleteFeed(request.user.id, request.params.id)) }),
  );

  app.get(
    '/projects/:id/webhooks',
    {
      schema: {
        tags: webhookTags,
        summary: "A project's webhooks (project admins)",
        params: projectParamsSchema,
        response: { 200: ok(z.array(webhookSchema)) },
      },
    },
    async (request) => ({ success: true as const, data: await webhooks.listWebhooks(request.params.id, request.user.id) }),
  );

  app.post(
    '/projects/:id/webhooks',
    {
      schema: {
        tags: webhookTags,
        summary: 'Add a webhook; the response has its signing secret',
        params: projectParamsSchema,
        body: createWebhookSchema,
        response: { 201: ok(webhookWithSecretSchema) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({ success: true, data: await webhooks.createWebhook(request.params.id, request.user.id, request.body) }),
  );

  app.patch(
    '/webhooks/:id',
    {
      schema: {
        tags: webhookTags,
        summary: 'Change a webhook, or pause or resume it',
        params: integrationParamsSchema,
        body: updateWebhookSchema,
        response: { 200: ok(webhookSchema) },
      },
    },
    async (request) => ({ success: true as const, data: await webhooks.updateWebhook(request.params.id, request.user.id, request.body) }),
  );

  app.post(
    '/webhooks/:id/secret',
    {
      schema: {
        tags: webhookTags,
        summary: 'Replace the signing secret',
        params: integrationParamsSchema,
        response: { 200: ok(webhookWithSecretSchema) },
      },
    },
    async (request) => ({ success: true as const, data: await webhooks.rotateSecret(request.params.id, request.user.id) }),
  );

  app.post(
    '/webhooks/:id/test',
    {
      config: { rateLimit: { max: rateLimitMax(10), timeWindow: '1 minute' } },
      schema: {
        tags: webhookTags,
        summary: 'Send a test delivery now and report what happened',
        params: integrationParamsSchema,
        response: {
          200: ok(z.object({ ok: z.boolean(), status: z.number().int().nullable(), error: z.string().nullable() })),
        },
      },
    },
    async (request) => ({ success: true as const, data: await webhooks.sendPing(request.params.id, request.user.id) }),
  );

  app.delete(
    '/webhooks/:id',
    { schema: { tags: webhookTags, summary: 'Delete a webhook', params: integrationParamsSchema, response: { 200: messageResponse } } },
    async (request) => ({ success: true as const, ...(await webhooks.deleteWebhook(request.params.id, request.user.id)) }),
  );
}
