import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createLabelSchema,
  updateLabelSchema,
  labelParamsSchema,
  reorderLabelsSchema,
  labelSchema,
  messageResponse,
  ok,
} from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import * as labelService from '../services/labelService.js';

const tags = ['Labels'];

export async function labelRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.get(
    '/',
    { schema: { tags, summary: 'List your labels', response: { 200: ok(z.array(labelSchema)) } } },
    async (request) => ({
      success: true as const,
      data: await labelService.getUserLabels(request.user.id),
    }),
  );

  app.post(
    '/',
    {
      schema: {
        tags,
        summary: 'Create a label',
        body: createLabelSchema,
        response: { 201: ok(labelSchema) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        success: true,
        data: await labelService.createLabel(request.body, request.user.id),
      }),
  );

  app.patch(
    '/:id',
    {
      schema: {
        tags,
        summary: 'Update a label',
        params: labelParamsSchema,
        body: updateLabelSchema,
        response: { 200: ok(labelSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await labelService.updateLabel(request.params.id, request.body, request.user.id),
    }),
  );

  app.delete(
    '/:id',
    {
      schema: {
        tags,
        summary: 'Delete a label',
        params: labelParamsSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await labelService.deleteLabel(request.params.id, request.user.id)),
    }),
  );

  app.put(
    '/reorder',
    {
      schema: {
        tags,
        summary: 'Reorder your labels',
        body: reorderLabelsSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await labelService.reorderLabels(request.body.labelIds, request.user.id)),
    }),
  );
}
