import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createSectionBodySchema,
  projectSectionsParamsSchema,
  updateSectionSchema,
  sectionParamsSchema,
  reorderSectionsSchema,
  sectionSchema,
  messageResponse,
  ok,
} from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import * as sectionService from '../services/sectionService.js';

const tags = ['Sections'];

export async function sectionRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.get(
    '/projects/:projectId/sections',
    {
      schema: {
        tags,
        summary: "List a project's sections",
        params: projectSectionsParamsSchema,
        response: { 200: ok(z.array(sectionSchema)) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await sectionService.getProjectSections(request.params.projectId, request.user.id),
    }),
  );

  app.post(
    '/projects/:projectId/sections',
    {
      schema: {
        tags,
        summary: 'Add a section to a project',
        params: projectSectionsParamsSchema,
        body: createSectionBodySchema,
        response: { 201: ok(sectionSchema) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        success: true,
        data: await sectionService.createSection(
          { ...request.body, projectId: request.params.projectId },
          request.user.id,
        ),
      }),
  );

  app.patch(
    '/sections/:id',
    {
      schema: {
        tags,
        summary: 'Update a section',
        params: sectionParamsSchema,
        body: updateSectionSchema,
        response: { 200: ok(sectionSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await sectionService.updateSection(request.params.id, request.body, request.user.id),
    }),
  );

  app.delete(
    '/sections/:id',
    {
      schema: {
        tags,
        summary: 'Delete a section (its tasks stay in the project)',
        params: sectionParamsSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await sectionService.deleteSection(request.params.id, request.user.id)),
    }),
  );

  app.put(
    '/sections/reorder',
    {
      schema: {
        tags,
        summary: 'Reorder sections',
        body: reorderSectionsSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await sectionService.reorderSections(request.body.sectionIds, request.user.id)),
    }),
  );
}
