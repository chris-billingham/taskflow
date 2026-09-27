import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  inviteMemberSchema,
  updateMemberSchema,
  workspaceParamsSchema,
  workspaceMemberParamsSchema,
  workspaceInviteParamsSchema,
  joinWorkspaceSchema,
  transferOwnershipSchema,
  workspaceSummarySchema,
  workspaceSchema,
  createdWorkspaceSchema,
  updatedWorkspaceSchema,
  workspaceMemberSchema,
  workspaceInviteSchema,
  joinedWorkspaceSchema,
  messageResponse,
  ok,
} from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import * as workspaceService from '../services/workspaceService.js';

const tags = ['Workspaces'];

export async function workspaceRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.get(
    '/',
    {
      schema: { tags, summary: 'Workspaces you belong to', response: { 200: ok(z.array(workspaceSummarySchema)) } },
    },
    async (request) => ({
      success: true as const,
      data: await workspaceService.getUserWorkspaces(request.user.id),
    }),
  );

  app.post(
    '/',
    {
      schema: {
        tags,
        summary: 'Create a workspace (you become its owner)',
        body: createWorkspaceSchema,
        response: { 201: ok(createdWorkspaceSchema) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        success: true,
        data: await workspaceService.createWorkspace(request.body, request.user.id),
      }),
  );

  app.post(
    '/join',
    {
      schema: {
        tags,
        summary: 'Accept an invitation by its token',
        body: joinWorkspaceSchema,
        response: { 200: ok(joinedWorkspaceSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await workspaceService.acceptInvite(request.body.token, request.user.id),
    }),
  );

  app.get(
    '/:id',
    {
      schema: {
        tags,
        summary: 'A workspace with its owner and members',
        params: workspaceParamsSchema,
        response: { 200: ok(workspaceSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await workspaceService.getWorkspaceById(request.params.id, request.user.id),
    }),
  );

  app.patch(
    '/:id',
    {
      schema: {
        tags,
        summary: 'Rename or describe a workspace',
        params: workspaceParamsSchema,
        body: updateWorkspaceSchema,
        response: { 200: ok(updatedWorkspaceSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await workspaceService.updateWorkspace(request.params.id, request.body, request.user.id),
    }),
  );

  app.delete(
    '/:id',
    {
      schema: {
        tags,
        summary: 'Delete a workspace and its projects (owner only)',
        params: workspaceParamsSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await workspaceService.deleteWorkspace(request.params.id, request.user.id)),
    }),
  );

  app.get(
    '/:id/members',
    {
      schema: {
        tags,
        summary: "A workspace's members",
        params: workspaceParamsSchema,
        response: { 200: ok(z.array(workspaceMemberSchema)) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await workspaceService.getWorkspaceMembers(request.params.id, request.user.id),
    }),
  );

  app.post(
    '/:id/invite',
    {
      schema: {
        tags,
        summary: 'Invite someone by email (admins)',
        params: workspaceParamsSchema,
        body: inviteMemberSchema,
        response: { 201: ok(workspaceInviteSchema) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        success: true,
        data: await workspaceService.inviteMember(request.params.id, request.body, request.user.id),
      }),
  );

  app.get(
    '/:id/invites',
    {
      schema: {
        tags,
        summary: 'Pending invitations (admins)',
        params: workspaceParamsSchema,
        response: { 200: ok(z.array(workspaceInviteSchema)) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await workspaceService.getPendingInvites(request.params.id, request.user.id),
    }),
  );

  app.post(
    '/:id/invites/:inviteId/resend',
    {
      schema: {
        tags,
        summary: 'Resend an invitation with a fresh link and expiry',
        params: workspaceInviteParamsSchema,
        response: { 200: ok(workspaceInviteSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await workspaceService.resendInvite(request.params.id, request.params.inviteId, request.user.id),
    }),
  );

  app.delete(
    '/:id/invites/:inviteId',
    {
      schema: {
        tags,
        summary: 'Cancel an invitation',
        params: workspaceInviteParamsSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await workspaceService.cancelInvite(request.params.id, request.params.inviteId, request.user.id)),
    }),
  );

  app.patch(
    '/:id/members/:userId',
    {
      schema: {
        tags,
        summary: "Change a member's role",
        params: workspaceMemberParamsSchema,
        body: updateMemberSchema,
        response: { 200: ok(workspaceMemberSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await workspaceService.updateMemberRole(
        request.params.id,
        request.params.userId,
        request.body,
        request.user.id,
      ),
    }),
  );

  app.delete(
    '/:id/members/:userId',
    {
      schema: {
        tags,
        summary: 'Remove a member',
        params: workspaceMemberParamsSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await workspaceService.removeMember(request.params.id, request.params.userId, request.user.id)),
    }),
  );

  app.post(
    '/:id/leave',
    {
      schema: { tags, summary: 'Leave a workspace', params: workspaceParamsSchema, response: { 200: messageResponse } },
    },
    async (request) => ({
      success: true as const,
      ...(await workspaceService.leaveWorkspace(request.params.id, request.user.id)),
    }),
  );

  app.post(
    '/:id/transfer',
    {
      schema: {
        tags,
        summary: 'Hand ownership to another member',
        params: workspaceParamsSchema,
        body: transferOwnershipSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await workspaceService.transferOwnership(request.params.id, request.body.newOwnerId, request.user.id)),
    }),
  );
}
