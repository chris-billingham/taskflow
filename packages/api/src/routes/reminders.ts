import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import {
  createReminderSchema,
  reminderParamsSchema,
  taskParamsSchema,
} from '../schemas/reminder.js';
import * as reminderService from '../services/reminderService.js';
import { ValidationError } from '../errors/index.js';

export async function reminderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/v1/tasks/:taskId/reminders - List reminders for a task
  app.get('/tasks/:taskId/reminders', async (request, reply) => {
    const params = taskParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await reminderService.getTaskReminders(
      params.data.taskId,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // POST /api/v1/tasks/:taskId/reminders - Create a reminder
  app.post('/tasks/:taskId/reminders', async (request, reply) => {
    const params = taskParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const body = createReminderSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      taskId: params.data.taskId,
    });
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await reminderService.createReminder(body.data, request.user.id);
    return reply.status(201).send({ success: true, data });
  });

  // DELETE /api/v1/reminders/:id - Delete a reminder
  app.delete('/reminders/:id', async (request, reply) => {
    const params = reminderParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await reminderService.deleteReminder(
      params.data.id,
      request.user.id,
    );
    return reply.send({ success: true, ...data });
  });
}
