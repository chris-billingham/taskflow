import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import {
  createLabelSchema,
  updateLabelSchema,
  labelParamsSchema,
} from '../schemas/label.js';
import * as labelService from '../services/labelService.js';
import { ValidationError } from '../errors/index.js';

export async function labelRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/v1/labels - List user's labels
  app.get('/', async (request, reply) => {
    const data = await labelService.getUserLabels(request.user.id);
    return reply.send({ success: true, data });
  });

  // POST /api/v1/labels - Create label
  app.post('/', async (request, reply) => {
    const result = createLabelSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await labelService.createLabel(result.data, request.user.id);
    return reply.status(201).send({ success: true, data });
  });

  // PATCH /api/v1/labels/:id - Update label
  app.patch('/:id', async (request, reply) => {
    const params = labelParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const body = updateLabelSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await labelService.updateLabel(
      params.data.id,
      body.data,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // DELETE /api/v1/labels/:id - Delete label
  app.delete('/:id', async (request, reply) => {
    const params = labelParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await labelService.deleteLabel(params.data.id, request.user.id);
    return reply.send({ success: true, ...data });
  });
}
