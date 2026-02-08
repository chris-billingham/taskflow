import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100),
  description: z.string().max(500).optional(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email('Valid email is required'),
  role: z.enum(['ADMIN', 'MEMBER', 'GUEST']).default('MEMBER'),
});

export const updateMemberSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER', 'GUEST']),
});

export const workspaceParamsSchema = z.object({
  id: z.string().min(1, 'Workspace ID is required'),
});

export const workspaceMemberParamsSchema = z.object({
  id: z.string().min(1, 'Workspace ID is required'),
  userId: z.string().min(1, 'User ID is required'),
});

export const joinWorkspaceSchema = z.object({
  token: z.string().min(1, 'Invite token is required'),
});

export const transferOwnershipSchema = z.object({
  newOwnerId: z.string().min(1, 'New owner ID is required'),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type WorkspaceParams = z.infer<typeof workspaceParamsSchema>;
export type WorkspaceMemberParams = z.infer<typeof workspaceMemberParamsSchema>;
export type JoinWorkspaceInput = z.infer<typeof joinWorkspaceSchema>;
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;
