import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import * as activityService from '../services/activityService.js';
import { ValidationError } from '../errors/index.js';

export async function activityRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/v1/tasks/:taskId/activity - Get activity for a task
  app.get('/tasks/:taskId/activity', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    if (!taskId) {
      throw new ValidationError('Task ID is required');
    }

    const { limit } = request.query as { limit?: string };
    const data = await activityService.getTaskActivity(
      taskId,
      request.user.id,
      limit ? parseInt(limit, 10) : undefined,
    );
    return reply.send({ success: true, data });
  });

  // GET /api/v1/projects/:projectId/activity - Get activity for a project
  app.get('/projects/:projectId/activity', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }

    const { limit } = request.query as { limit?: string };
    const data = await activityService.getProjectActivity(
      projectId,
      request.user.id,
      limit ? parseInt(limit, 10) : undefined,
    );
    return reply.send({ success: true, data });
  });

  // GET /api/v1/activity - Get current user's activity
  app.get('/activity', async (request, reply) => {
    const { limit } = request.query as { limit?: string };
    const data = await activityService.getUserActivity(
      request.user.id,
      limit ? parseInt(limit, 10) : undefined,
    );
    return reply.send({ success: true, data });
  });
}
