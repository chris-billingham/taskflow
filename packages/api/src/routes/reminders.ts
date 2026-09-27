import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createReminderBodySchema,
  reminderParamsSchema,
  taskIdParamsSchema,
  reminderSchema,
  messageResponse,
  ok,
} from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import * as reminderService from '../services/reminderService.js';

const tags = ['Reminders'];

export async function reminderRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.get(
    '/tasks/:taskId/reminders',
    {
      schema: {
        tags,
        summary: 'Your reminders on a task',
        params: taskIdParamsSchema,
        response: { 200: ok(z.array(reminderSchema)) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await reminderService.getTaskReminders(request.params.taskId, request.user.id),
    }),
  );

  app.post(
    '/tasks/:taskId/reminders',
    {
      schema: {
        tags,
        summary: 'Add a reminder: at a time (ABSOLUTE) or before the due time (RELATIVE)',
        params: taskIdParamsSchema,
        body: createReminderBodySchema,
        response: { 201: ok(reminderSchema) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        success: true,
        data: await reminderService.createReminder(
          { ...request.body, taskId: request.params.taskId },
          request.user.id,
        ),
      }),
  );

  app.delete(
    '/reminders/:id',
    {
      schema: { tags, summary: 'Delete a reminder', params: reminderParamsSchema, response: { 200: messageResponse } },
    },
    async (request) => ({
      success: true as const,
      ...(await reminderService.deleteReminder(request.params.id, request.user.id)),
    }),
  );
}
