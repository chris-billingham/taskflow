import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createCommentSchema,
  updateCommentSchema,
  commentParamsSchema,
  commentQuerySchema,
  taskIdParamsSchema,
  commentSchema,
  messageResponse,
  ok,
} from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import * as commentService from '../services/commentService.js';

const tags = ['Comments'];

export async function commentRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.get(
    '/tasks/:taskId/comments',
    {
      schema: {
        tags,
        summary: "A task's comments, newest first, with replies",
        params: taskIdParamsSchema,
        querystring: commentQuerySchema,
        response: { 200: ok(z.array(commentSchema)) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await commentService.getTaskComments(
        request.params.taskId,
        request.user.id,
        request.query.limit,
        request.query.cursor,
      ),
    }),
  );

  app.post(
    '/tasks/:taskId/comments',
    {
      schema: {
        tags,
        summary: 'Comment on a task (or reply with parentId)',
        params: taskIdParamsSchema,
        body: createCommentSchema,
        response: { 201: ok(commentSchema) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        success: true,
        data: await commentService.createComment(request.params.taskId, request.body, request.user.id),
      }),
  );

  app.patch(
    '/comments/:id',
    {
      schema: {
        tags,
        summary: 'Edit your comment',
        params: commentParamsSchema,
        body: updateCommentSchema,
        response: { 200: ok(commentSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await commentService.updateComment(request.params.id, request.body, request.user.id),
    }),
  );

  app.delete(
    '/comments/:id',
    {
      schema: { tags, summary: 'Delete a comment', params: commentParamsSchema, response: { 200: messageResponse } },
    },
    async (request) => ({
      success: true as const,
      ...(await commentService.deleteComment(request.params.id, request.user.id)),
    }),
  );
}
