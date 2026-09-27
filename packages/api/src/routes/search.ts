import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { searchQuerySchema, searchResultsSchema, ok } from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import * as searchService from '../services/searchService.js';

export async function searchRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.get(
    '/',
    {
      schema: {
        tags: ['Search'],
        summary: 'Full-text search across tasks, projects and comments you can see',
        querystring: searchQuerySchema,
        response: { 200: ok(searchResultsSchema) },
      },
    },
    async (request) => {
      const { q, type, limit, offset } = request.query;
      const entityTypes = type
        ? type.split(',').map((t) => t.trim()).filter(Boolean)
        : ['task', 'project', 'comment'];
      return {
        success: true as const,
        data: await searchService.searchAll(q, request.user.id, { limit, offset, entityTypes }),
      };
    },
  );
}
