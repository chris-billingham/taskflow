import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import {
  createProjectSchema,
  updateProjectSchema,
  projectParamsSchema,
  reorderProjectsSchema,
  duplicateProjectSchema,
} from '../schemas/project.js';
import * as projectService from '../services/projectService.js';
import { ValidationError } from '../errors/index.js';

export async function projectRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/v1/projects - List user's projects
  app.get('/', async (request, reply) => {
    const data = await projectService.getUserProjects(request.user.id);
    return reply.send({ success: true, data });
  });

  // POST /api/v1/projects - Create project
  app.post('/', async (request, reply) => {
    const result = createProjectSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await projectService.createProject(result.data, request.user.id);
    return reply.status(201).send({ success: true, data });
  });

  // GET /api/v1/projects/:id - Get project details
  app.get('/:id', async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await projectService.getProjectById(params.data.id, request.user.id);
    return reply.send({ success: true, data });
  });

  // PATCH /api/v1/projects/:id - Update project
  app.patch('/:id', async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const body = updateProjectSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await projectService.updateProject(
      params.data.id,
      body.data,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // DELETE /api/v1/projects/:id - Delete project
  app.delete('/:id', async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await projectService.deleteProject(params.data.id, request.user.id);
    return reply.send({ success: true, ...data });
  });

  // GET /api/v1/projects/:id/members - List project members
  app.get('/:id/members', async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await projectService.getProjectMembers(params.data.id, request.user.id);
    return reply.send({ success: true, data });
  });

  // POST /api/v1/projects/:id/archive - Archive project
  app.post('/:id/archive', async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await projectService.archiveProject(params.data.id, request.user.id);
    return reply.send({ success: true, data });
  });

  // POST /api/v1/projects/:id/unarchive - Unarchive project
  app.post('/:id/unarchive', async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await projectService.unarchiveProject(params.data.id, request.user.id);
    return reply.send({ success: true, data });
  });

  // POST /api/v1/projects/:id/duplicate - Duplicate project
  app.post('/:id/duplicate', async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const body = duplicateProjectSchema.safeParse(request.body ?? {});
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await projectService.duplicateProject(
      params.data.id,
      request.user.id,
      body.data.name,
    );
    return reply.status(201).send({ success: true, data });
  });

  // PUT /api/v1/projects/reorder - Reorder projects
  app.put('/reorder', async (request, reply) => {
    const result = reorderProjectsSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await projectService.reorderProjects(
      result.data.projectIds,
      request.user.id,
    );
    return reply.send({ success: true, ...data });
  });
}
