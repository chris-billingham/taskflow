import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import * as searchService from '../services/searchService.js';
import { ValidationError } from '../errors/index.js';

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200).trim(),
  type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function searchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/v1/search?q=query&type=task,project,comment&limit=10&offset=0
  app.get('/', async (request, reply) => {
    const result = searchQuerySchema.safeParse(request.query);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const { q, type, limit, offset } = result.data;
    const entityTypes = type
      ? type.split(',').map((t) => t.trim()).filter(Boolean)
      : ['task', 'project', 'comment'];

    const data = await searchService.searchAll(q, request.user.id, {
      limit,
      offset,
      entityTypes,
    });

    return reply.send({ success: true, data });
  });
}
