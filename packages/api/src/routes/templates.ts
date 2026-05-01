import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import {
  createTemplateSchema,
  applyTemplateSchema,
  updateTemplateSchema,
  templateParamsSchema,
  workspaceTemplateParamsSchema,
} from '../schemas/template.js';
import * as templateService from '../services/templateService.js';
import { ValidationError } from '../errors/index.js';

export async function templateRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/v1/templates - List user's personal templates
  app.get('/', async (request, reply) => {
    const data = await templateService.getUserTemplates(request.user.id);
    return reply.send({ success: true, data });
  });

  // GET /api/v1/templates/gallery - Public templates
  app.get('/gallery', async (_request, reply) => {
    const data = await templateService.getPublicTemplates();
    return reply.send({ success: true, data });
  });

  // GET /api/v1/templates/workspace/:id - Workspace templates
  app.get('/workspace/:id', async (request, reply) => {
    const params = workspaceTemplateParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await templateService.getWorkspaceTemplates(
      params.data.id,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // POST /api/v1/templates - Create template from project
  app.post('/', async (request, reply) => {
    const result = createTemplateSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await templateService.createTemplate(result.data, request.user.id);
    return reply.status(201).send({ success: true, data });
  });

  // GET /api/v1/templates/:id - Get template details
  app.get('/:id', async (request, reply) => {
    const params = templateParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await templateService.getTemplateById(params.data.id, request.user.id);
    return reply.send({ success: true, data });
  });

  // POST /api/v1/templates/:id/apply - Apply template (create project from it)
  app.post('/:id/apply', async (request, reply) => {
    const params = templateParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const body = applyTemplateSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await templateService.applyTemplate(
      params.data.id,
      body.data,
      request.user.id,
    );
    return reply.status(201).send({ success: true, data });
  });

  // PATCH /api/v1/templates/:id - Update template
  app.patch('/:id', async (request, reply) => {
    const params = templateParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const body = updateTemplateSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await templateService.updateTemplate(
      params.data.id,
      body.data,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // DELETE /api/v1/templates/:id - Delete template
  app.delete('/:id', async (request, reply) => {
    const params = templateParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await templateService.deleteTemplate(params.data.id, request.user.id);
    return reply.send({ success: true, ...data });
  });
}
