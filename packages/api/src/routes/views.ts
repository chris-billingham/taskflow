import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  upcomingQuerySchema,
  rescheduleOverdueSchema,
  todayViewSchema,
  upcomingViewSchema,
  rescheduleResultSchema,
  ok,
} from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import * as viewService from '../services/viewService.js';

const tags = ['Views'];

export async function viewRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.get(
    '/today',
    {
      schema: {
        tags,
        summary: "Overdue and today's tasks, in your timezone",
        response: { 200: ok(todayViewSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await viewService.getTodayTasks(request.user.id),
    }),
  );

  app.get(
    '/upcoming',
    {
      schema: {
        tags,
        summary: 'Tasks for the coming days, keyed by date',
        querystring: upcomingQuerySchema,
        response: { 200: ok(upcomingViewSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await viewService.getUpcomingTasks(
        request.user.id,
        request.query.days,
        request.query.includeNoDate === 'true',
      ),
    }),
  );

  app.post(
    '/reschedule-overdue',
    {
      schema: {
        tags,
        summary: 'Move every overdue task you can edit to a date',
        body: rescheduleOverdueSchema,
        response: { 200: rescheduleResultSchema },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await viewService.rescheduleOverdue(request.user.id, request.body.targetDate)),
    }),
  );
}
