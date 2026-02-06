import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import {
  createSectionSchema,
  updateSectionSchema,
  sectionParamsSchema,
  reorderSectionsSchema,
} from '../schemas/section.js';
import * as sectionService from '../services/sectionService.js';
import { ValidationError } from '../errors/index.js';

export async function sectionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/v1/projects/:projectId/sections - List sections
  app.get('/projects/:projectId/sections', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }

    const data = await sectionService.getProjectSections(projectId, request.user.id);
    return reply.send({ success: true, data });
  });

  // POST /api/v1/projects/:projectId/sections - Create section
  app.post('/projects/:projectId/sections', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body as Record<string, unknown>;

    const result = createSectionSchema.safeParse({
      ...body,
      projectId,
    });
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await sectionService.createSection(result.data, request.user.id);
    return reply.status(201).send({ success: true, data });
  });

  // PATCH /api/v1/sections/:id - Update section
  app.patch('/sections/:id', async (request, reply) => {
    const params = sectionParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const body = updateSectionSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await sectionService.updateSection(
      params.data.id,
      body.data,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // DELETE /api/v1/sections/:id - Delete section
  app.delete('/sections/:id', async (request, reply) => {
    const params = sectionParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await sectionService.deleteSection(params.data.id, request.user.id);
    return reply.send({ success: true, ...data });
  });

  // PUT /api/v1/sections/reorder - Reorder sections
  app.put('/sections/reorder', async (request, reply) => {
    const result = reorderSectionsSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await sectionService.reorderSections(
      result.data.sectionIds,
      request.user.id,
    );
    return reply.send({ success: true, ...data });
  });
}
