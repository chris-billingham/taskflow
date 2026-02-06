import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import {
  createFilterSchema,
  updateFilterSchema,
  filterParamsSchema,
  filterQuerySchema,
} from '../schemas/filter.js';
import * as filterService from '../services/filterService.js';
import { ValidationError } from '../errors/index.js';

export async function filterRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/v1/filters - List user's filters
  app.get('/', async (request, reply) => {
    const data = await filterService.getUserFilters(request.user.id);
    return reply.send({ success: true, data });
  });

  // POST /api/v1/filters - Create filter
  app.post('/', async (request, reply) => {
    const result = createFilterSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await filterService.createFilter(result.data, request.user.id);
    return reply.status(201).send({ success: true, data });
  });

  // PATCH /api/v1/filters/:id - Update filter
  app.patch('/:id', async (request, reply) => {
    const params = filterParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const body = updateFilterSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await filterService.updateFilter(
      params.data.id,
      body.data,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // DELETE /api/v1/filters/:id - Delete filter
  app.delete('/:id', async (request, reply) => {
    const params = filterParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await filterService.deleteFilter(params.data.id, request.user.id);
    return reply.send({ success: true, ...data });
  });

  // POST /api/v1/filters/query - Execute filter query
  app.post('/query', async (request, reply) => {
    const result = filterQuerySchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await filterService.executeFilter(result.data.query, request.user.id);
    return reply.send({ success: true, data });
  });

  // POST /api/v1/filters/validate - Validate query syntax
  app.post('/validate', async (request, reply) => {
    const result = filterQuerySchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const validation = filterService.validateFilterQuery(result.data.query);
    return reply.send({ success: true, data: validation });
  });
}
