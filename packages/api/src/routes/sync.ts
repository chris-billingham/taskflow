import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { syncQuerySchema, syncResponse } from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import { sync } from '../services/deltaSync.js';

export async function syncRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.get(
    '/',
    {
      schema: {
        tags: ['Sync'],
        summary: 'Projects, sections, tasks and labels changed since a cursor (everything, without one)',
        description:
          'Store the returned cursor and send it as `since` next time. Upsert rows by id (one may arrive twice), drop the ids in `deleted`, ' +
          'drop projects missing from `projectIds` (and their sections and tasks, except tasks assigned to you), and when `reset` is true, ' +
          'drop everything first. A full sync leaves out tasks completed more than 30 days ago.',
        querystring: syncQuerySchema,
        response: { 200: syncResponse },
      },
    },
    async (request) => ({ success: true as const, data: await sync(request.user.id, request.query.since) }),
  );
}
