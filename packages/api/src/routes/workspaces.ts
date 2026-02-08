import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  inviteMemberSchema,
  updateMemberSchema,
  workspaceParamsSchema,
  workspaceMemberParamsSchema,
  joinWorkspaceSchema,
  transferOwnershipSchema,
} from '../schemas/workspace.js';
import * as workspaceService from '../services/workspaceService.js';
import { ValidationError } from '../errors/index.js';

export async function workspaceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/v1/workspaces - List user's workspaces
  app.get('/', async (request, reply) => {
    const data = await workspaceService.getUserWorkspaces(request.user.id);
    return reply.send({ success: true, data });
  });

  // POST /api/v1/workspaces - Create workspace
  app.post('/', async (request, reply) => {
    const result = createWorkspaceSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await workspaceService.createWorkspace(
      result.data,
      request.user.id,
    );
    return reply.status(201).send({ success: true, data });
  });

  // POST /api/v1/workspaces/join - Accept invite by token
  app.post('/join', async (request, reply) => {
    const result = joinWorkspaceSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await workspaceService.acceptInvite(
      result.data.token,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // GET /api/v1/workspaces/:id - Get workspace details
  app.get('/:id', async (request, reply) => {
    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await workspaceService.getWorkspaceById(
      params.data.id,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // PATCH /api/v1/workspaces/:id - Update workspace
  app.patch('/:id', async (request, reply) => {
    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const body = updateWorkspaceSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await workspaceService.updateWorkspace(
      params.data.id,
      body.data,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // DELETE /api/v1/workspaces/:id - Delete workspace
  app.delete('/:id', async (request, reply) => {
    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await workspaceService.deleteWorkspace(
      params.data.id,
      request.user.id,
    );
    return reply.send({ success: true, ...data });
  });

  // GET /api/v1/workspaces/:id/members - List members
  app.get('/:id/members', async (request, reply) => {
    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await workspaceService.getWorkspaceMembers(
      params.data.id,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // POST /api/v1/workspaces/:id/invite - Invite member
  app.post('/:id/invite', async (request, reply) => {
    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const body = inviteMemberSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await workspaceService.inviteMember(
      params.data.id,
      body.data,
      request.user.id,
    );
    return reply.status(201).send({ success: true, data });
  });

  // GET /api/v1/workspaces/:id/invites - List pending invites
  app.get('/:id/invites', async (request, reply) => {
    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await workspaceService.getPendingInvites(
      params.data.id,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // POST /api/v1/workspaces/:id/invites/:inviteId/resend - Resend invite
  app.post('/:id/invites/:inviteId/resend', async (request, reply) => {
    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const { inviteId } = request.params as { inviteId: string };

    const data = await workspaceService.resendInvite(
      params.data.id,
      inviteId,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // DELETE /api/v1/workspaces/:id/invites/:inviteId - Cancel invite
  app.delete('/:id/invites/:inviteId', async (request, reply) => {
    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const { inviteId } = request.params as { inviteId: string };

    const data = await workspaceService.cancelInvite(
      params.data.id,
      inviteId,
      request.user.id,
    );
    return reply.send({ success: true, ...data });
  });

  // PATCH /api/v1/workspaces/:id/members/:userId - Update member role
  app.patch('/:id/members/:userId', async (request, reply) => {
    const params = workspaceMemberParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const body = updateMemberSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await workspaceService.updateMemberRole(
      params.data.id,
      params.data.userId,
      body.data,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // DELETE /api/v1/workspaces/:id/members/:userId - Remove member
  app.delete('/:id/members/:userId', async (request, reply) => {
    const params = workspaceMemberParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await workspaceService.removeMember(
      params.data.id,
      params.data.userId,
      request.user.id,
    );
    return reply.send({ success: true, ...data });
  });

  // POST /api/v1/workspaces/:id/leave - Leave workspace
  app.post('/:id/leave', async (request, reply) => {
    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await workspaceService.leaveWorkspace(
      params.data.id,
      request.user.id,
    );
    return reply.send({ success: true, ...data });
  });

  // POST /api/v1/workspaces/:id/transfer - Transfer ownership
  app.post('/:id/transfer', async (request, reply) => {
    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const body = transferOwnershipSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await workspaceService.transferOwnership(
      params.data.id,
      body.data.newOwnerId,
      request.user.id,
    );
    return reply.send({ success: true, ...data });
  });
}
