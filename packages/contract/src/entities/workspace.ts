import { z } from 'zod';
import { id, instant, type Wire } from '../common.js';
import { workspaceRoleSchema } from './account.js';
import { userSummarySchema } from './user.js';

const counts = z.object({ members: z.number().int(), projects: z.number().int() });

export const workspaceFieldsSchema = z.object({
  id,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  ownerId: id,
  createdAt: instant,
  updatedAt: instant,
});

export const workspaceMemberSchema = z.object({
  id,
  workspaceId: id,
  userId: id,
  role: workspaceRoleSchema,
  joinedAt: instant,
  /** Email is null when a GUEST is looking: guests see names, not addresses. */
  user: userSummarySchema.extend({ email: z.string().nullable() }),
});
export type WorkspaceMember = Wire<typeof workspaceMemberSchema>;

/** A workspace you belong to, with your role in it. */
export const workspaceSummarySchema = workspaceFieldsSchema.extend({
  _count: counts,
  role: workspaceRoleSchema,
});
export type WorkspaceSummary = Wire<typeof workspaceSummarySchema>;

/** GET /workspaces/:id. */
export const workspaceSchema = workspaceFieldsSchema.extend({
  owner: userSummarySchema,
  members: z.array(workspaceMemberSchema),
  _count: counts,
});
export type Workspace = Wire<typeof workspaceSchema>;

/** POST /workspaces: the new workspace, its first member (you) and your role. */
export const createdWorkspaceSchema = workspaceFieldsSchema.extend({
  members: z.array(workspaceMemberSchema),
  _count: counts,
  role: workspaceRoleSchema,
});

/** PATCH /workspaces/:id. */
export const updatedWorkspaceSchema = workspaceFieldsSchema.extend({ _count: counts });

/**
 * A pending invitation. The token is what the join link carries; only
 * workspace admins can list invites.
 */
export const workspaceInviteSchema = z.object({
  id,
  email: z.string(),
  role: workspaceRoleSchema,
  token: z.string(),
  expiresAt: instant,
  workspaceId: id.optional(),
  createdAt: instant.optional(),
});
export type WorkspaceInvite = Wire<typeof workspaceInviteSchema>;

/** POST /workspaces/join. */
export const joinedWorkspaceSchema = z.object({ workspace: workspaceSummarySchema });
