import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  activityQuerySchema,
  activitySchema,
  projectIdParamsSchema,
  taskIdParamsSchema,
  page,
} from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import * as activityService from '../services/activityService.js';

const tags = ['Activity'];
const activityList = { 200: page(activitySchema) };

export async function activityRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.get(
    '/tasks/:taskId/activity',
    {
      schema: {
        tags,
        summary: "A task's history, newest first",
        params: taskIdParamsSchema,
        querystring: activityQuerySchema,
        response: activityList,
      },
    },
    async (request) => {
      const { limit, cursor } = request.query;
      const { items, nextCursor } = await activityService.getTaskActivity(
        request.params.taskId,
        request.user.id,
        limit,
        cursor,
      );
      return { success: true as const, data: items, nextCursor };
    },
  );

  app.get(
    '/projects/:projectId/activity',
    {
      schema: {
        tags,
        summary: "A project's history, newest first",
        params: projectIdParamsSchema,
        querystring: activityQuerySchema,
        response: activityList,
      },
    },
    async (request) => {
      const { limit, cursor } = request.query;
      const { items, nextCursor } = await activityService.getProjectActivity(
        request.params.projectId,
        request.user.id,
        limit,
        cursor,
      );
      return { success: true as const, data: items, nextCursor };
    },
  );

  app.get(
    '/activity',
    {
      schema: { tags, summary: 'Your own recent activity', querystring: activityQuerySchema, response: activityList },
    },
    async (request) => {
      const { limit, cursor } = request.query;
      const { items, nextCursor } = await activityService.getUserActivity(request.user.id, limit, cursor);
      return { success: true as const, data: items, nextCursor };
    },
  );
}
