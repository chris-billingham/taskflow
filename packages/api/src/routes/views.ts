import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { upcomingQuerySchema, rescheduleOverdueSchema } from '../schemas/view.js';
import * as viewService from '../services/viewService.js';
import { ValidationError } from '../errors/index.js';

export async function viewRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/v1/views/today
  app.get('/today', async (request, reply) => {
    const data = await viewService.getTodayTasks(request.user.id);
    return reply.send({ success: true, data });
  });

  // GET /api/v1/views/upcoming
  app.get('/upcoming', async (request, reply) => {
    const query = upcomingQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw new ValidationError(query.error.issues[0].message);
    }

    const data = await viewService.getUpcomingTasks(
      request.user.id,
      query.data.days,
      query.data.includeNoDate === 'true',
    );
    return reply.send({ success: true, data });
  });

  // POST /api/v1/views/reschedule-overdue
  app.post('/reschedule-overdue', async (request, reply) => {
    const body = rescheduleOverdueSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await viewService.rescheduleOverdue(
      request.user.id,
      body.data.targetDate,
    );
    return reply.send({ success: true, ...data });
  });
}
