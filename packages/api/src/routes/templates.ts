import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createTemplateSchema,
  applyTemplateSchema,
  updateTemplateSchema,
  templateParamsSchema,
  workspaceTemplateParamsSchema,
  templateSchema,
  projectSchema,
  messageResponse,
  ok,
} from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import * as templateService from '../services/templateService.js';

const tags = ['Templates'];
const templateList = { 200: ok(z.array(templateSchema)) };

export async function templateRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.get(
    '/',
    { schema: { tags, summary: 'Your templates', response: templateList } },
    async (request) => ({
      success: true as const,
      data: await templateService.getUserTemplates(request.user.id),
    }),
  );

  app.get(
    '/gallery',
    { schema: { tags, summary: 'Built-in templates', response: templateList } },
    async () => ({ success: true as const, data: await templateService.getPublicTemplates() }),
  );

  app.get(
    '/workspace/:id',
    {
      schema: {
        tags,
        summary: "Templates shared with a workspace",
        params: workspaceTemplateParamsSchema,
        response: templateList,
      },
    },
    async (request) => ({
      success: true as const,
      data: await templateService.getWorkspaceTemplates(request.params.id, request.user.id),
    }),
  );

  app.post(
    '/',
    {
      schema: {
        tags,
        summary: 'Save a project as a template',
        body: createTemplateSchema,
        response: { 201: ok(templateSchema) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        success: true,
        data: await templateService.createTemplate(request.body, request.user.id),
      }),
  );

  app.get(
    '/:id',
    { schema: { tags, summary: 'Get a template', params: templateParamsSchema, response: { 200: ok(templateSchema) } } },
    async (request) => ({
      success: true as const,
      data: await templateService.getTemplateById(request.params.id, request.user.id),
    }),
  );

  app.post(
    '/:id/apply',
    {
      schema: {
        tags,
        summary: 'Create a project from a template',
        params: templateParamsSchema,
        body: applyTemplateSchema,
        response: { 201: ok(projectSchema) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        success: true,
        data: await templateService.applyTemplate(request.params.id, request.body, request.user.id),
      }),
  );

  app.patch(
    '/:id',
    {
      schema: {
        tags,
        summary: 'Rename or describe your template',
        params: templateParamsSchema,
        body: updateTemplateSchema,
        response: { 200: ok(templateSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await templateService.updateTemplate(request.params.id, request.body, request.user.id),
    }),
  );

  app.delete(
    '/:id',
    {
      schema: { tags, summary: 'Delete your template', params: templateParamsSchema, response: { 200: messageResponse } },
    },
    async (request) => ({
      success: true as const,
      ...(await templateService.deleteTemplate(request.params.id, request.user.id)),
    }),
  );
}
