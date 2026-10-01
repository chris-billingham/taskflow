import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createProjectSchema,
  updateProjectSchema,
  projectParamsSchema,
  reorderProjectsSchema,
  duplicateProjectSchema,
  projectSchema,
  projectFieldsSchema,
  memberSummarySchema,
  messageResponse,
  ok,
  collaboratorParamsSchema,
  shareProjectSchema,
  updateCollaboratorSchema,
  projectCollaboratorSchema,
  projectSharingSchema,
} from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import * as projectService from '../services/projectService.js';
import * as projectSharing from '../services/projectSharing.js';

const tags = ['Projects'];

export async function projectRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.get(
    '/',
    {
      schema: {
        tags,
        summary: 'List every project you can see',
        response: { 200: ok(z.array(projectSchema)) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await projectService.getUserProjects(request.user.id),
    }),
  );

  app.post(
    '/',
    {
      schema: {
        tags,
        summary: 'Create a project',
        body: createProjectSchema,
        response: { 201: ok(projectSchema) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        success: true,
        data: await projectService.createProject(request.body, request.user.id),
      }),
  );

  app.get(
    '/:id',
    {
      schema: {
        tags,
        summary: 'Get a project',
        params: projectParamsSchema,
        response: { 200: ok(projectSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await projectService.getProjectById(request.params.id, request.user.id),
    }),
  );

  app.patch(
    '/:id',
    {
      schema: {
        tags,
        summary: 'Update a project',
        params: projectParamsSchema,
        body: updateProjectSchema,
        response: { 200: ok(projectSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await projectService.updateProject(request.params.id, request.body, request.user.id),
    }),
  );

  app.delete(
    '/:id',
    {
      schema: {
        tags,
        summary: 'Delete a project and all its tasks',
        params: projectParamsSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await projectService.deleteProject(request.params.id, request.user.id)),
    }),
  );

  app.get(
    '/:id/members',
    {
      schema: {
        tags,
        summary: 'People who can be assigned or mentioned in a project',
        params: projectParamsSchema,
        response: { 200: ok(z.array(memberSummarySchema)) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await projectService.getProjectMembers(request.params.id, request.user.id),
    }),
  );

  app.post(
    '/:id/archive',
    {
      schema: {
        tags,
        summary: 'Archive a project',
        params: projectParamsSchema,
        response: { 200: ok(projectFieldsSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await projectService.archiveProject(request.params.id, request.user.id),
    }),
  );

  app.post(
    '/:id/unarchive',
    {
      schema: {
        tags,
        summary: 'Restore an archived project',
        params: projectParamsSchema,
        response: { 200: ok(projectFieldsSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await projectService.unarchiveProject(request.params.id, request.user.id),
    }),
  );

  app.post(
    '/:id/duplicate',
    {
      schema: {
        tags,
        summary: 'Duplicate a project with its sections and open tasks',
        params: projectParamsSchema,
        body: duplicateProjectSchema.optional(),
        response: { 201: ok(projectSchema) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        success: true,
        data: await projectService.duplicateProject(
          request.params.id,
          request.user.id,
          request.body?.name,
        ),
      }),
  );

  app.put(
    '/reorder',
    {
      schema: {
        tags,
        summary: 'Reorder projects',
        body: reorderProjectsSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await projectService.reorderProjects(request.body.projectIds, request.user.id)),
    }),
  );

  app.get(
    '/:id/collaborators',
    {
      schema: {
        tags,
        summary: 'Who the project is shared with',
        params: projectParamsSchema,
        response: { 200: ok(projectSharingSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await projectSharing.getProjectSharing(request.params.id, request.user.id),
    }),
  );

  app.post(
    '/:id/collaborators',
    {
      schema: {
        tags,
        summary: 'Share the project with someone, by email (project admins)',
        params: projectParamsSchema,
        body: shareProjectSchema,
        response: { 201: ok(projectCollaboratorSchema) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        success: true as const,
        data: await projectSharing.shareProject(request.params.id, request.body, request.user.id),
      }),
  );

  app.patch(
    '/:id/collaborators/:userId',
    {
      schema: {
        tags,
        summary: "Change a collaborator's role (project admins)",
        params: collaboratorParamsSchema,
        body: updateCollaboratorSchema,
        response: { 200: ok(projectCollaboratorSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await projectSharing.updateCollaborator(
        request.params.id,
        request.params.userId,
        request.body.role,
        request.user.id,
      ),
    }),
  );

  app.delete(
    '/:id/collaborators/:userId',
    {
      schema: {
        tags,
        summary: 'Stop sharing with someone (project admins), or leave the project yourself',
        params: collaboratorParamsSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await projectSharing.removeCollaborator(request.params.id, request.params.userId, request.user.id)),
    }),
  );
}
