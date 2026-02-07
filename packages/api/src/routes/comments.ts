import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import {
  createCommentSchema,
  updateCommentSchema,
  commentParamsSchema,
  commentQuerySchema,
} from '../schemas/comment.js';
import * as commentService from '../services/commentService.js';
import { ValidationError } from '../errors/index.js';

export async function commentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/v1/tasks/:taskId/comments - List comments for a task
  app.get('/tasks/:taskId/comments', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    if (!taskId) {
      throw new ValidationError('Task ID is required');
    }

    const query = commentQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw new ValidationError(query.error.issues[0].message);
    }

    const data = await commentService.getTaskComments(
      taskId,
      request.user.id,
      query.data.limit,
      query.data.cursor,
    );
    return reply.send({ success: true, data });
  });

  // POST /api/v1/tasks/:taskId/comments - Create a comment
  app.post('/tasks/:taskId/comments', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    if (!taskId) {
      throw new ValidationError('Task ID is required');
    }

    const body = createCommentSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await commentService.createComment(
      taskId,
      body.data,
      request.user.id,
    );
    return reply.status(201).send({ success: true, data });
  });

  // PATCH /api/v1/comments/:id - Update a comment
  app.patch('/comments/:id', async (request, reply) => {
    const params = commentParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const body = updateCommentSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await commentService.updateComment(
      params.data.id,
      body.data,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // DELETE /api/v1/comments/:id - Delete a comment
  app.delete('/comments/:id', async (request, reply) => {
    const params = commentParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await commentService.deleteComment(
      params.data.id,
      request.user.id,
    );
    return reply.send({ success: true, ...data });
  });
}
