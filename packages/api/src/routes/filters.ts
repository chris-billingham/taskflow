import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createFilterSchema,
  updateFilterSchema,
  filterParamsSchema,
  filterQuerySchema,
  filterSchema,
  filterTaskSchema,
  filterValidationSchema,
  messageResponse,
  ok,
} from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import * as filterService from '../services/filterService.js';

const tags = ['Filters'];

export async function filterRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.get(
    '/',
    { schema: { tags, summary: 'List your saved filters', response: { 200: ok(z.array(filterSchema)) } } },
    async (request) => ({
      success: true as const,
      data: await filterService.getUserFilters(request.user.id),
    }),
  );

  app.post(
    '/',
    { schema: { tags, summary: 'Save a filter', body: createFilterSchema, response: { 201: ok(filterSchema) } } },
    async (request, reply) =>
      reply.status(201).send({
        success: true,
        data: await filterService.createFilter(request.body, request.user.id),
      }),
  );

  app.patch(
    '/:id',
    {
      schema: {
        tags,
        summary: 'Update a saved filter',
        params: filterParamsSchema,
        body: updateFilterSchema,
        response: { 200: ok(filterSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await filterService.updateFilter(request.params.id, request.body, request.user.id),
    }),
  );

  app.delete(
    '/:id',
    {
      schema: { tags, summary: 'Delete a saved filter', params: filterParamsSchema, response: { 200: messageResponse } },
    },
    async (request) => ({
      success: true as const,
      ...(await filterService.deleteFilter(request.params.id, request.user.id)),
    }),
  );

  app.post(
    '/query',
    {
      schema: {
        tags,
        summary: 'Run a filter query (first 200 matches)',
        body: filterQuerySchema,
        response: { 200: ok(z.array(filterTaskSchema)) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await filterService.executeFilter(request.body.query, request.user.id),
    }),
  );

  app.post(
    '/validate',
    {
      schema: {
        tags,
        summary: 'Check a filter query for syntax errors',
        body: filterQuerySchema,
        response: { 200: ok(filterValidationSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: filterService.validateFilterQuery(request.body.query),
    }),
  );
}
