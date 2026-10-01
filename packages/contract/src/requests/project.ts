import { z } from 'zod';
import { clientId, emailAddress, ifVersion } from '../common.js';
import { projectRoleSchema } from '../entities/project.js';

export const createProjectSchema = z.object({
  id: clientId.optional(),
  name: z.string().min(1, 'Project name is required').max(200),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format').optional(),
  workspaceId: z.string().optional(),
  parentId: z.string().optional(),
  description: z.string().max(2000).optional(),
  viewStyle: z.enum(['LIST', 'BOARD', 'CALENDAR']).optional(),
});

export const updateProjectSchema = z.object({
  ifVersion,
  name: z.string().min(1, 'Project name is required').max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  /** Nest under another project in the same workspace, or null for top level. */
  parentId: z.string().nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format').optional(),
  viewStyle: z.enum(['LIST', 'BOARD', 'CALENDAR']).optional(),
  isFavorite: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const projectParamsSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
});

export const collaboratorParamsSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  userId: z.string().min(1),
});

/** Share a project with someone who has an account, by email address. */
export const shareProjectSchema = z.object({
  email: emailAddress('Enter a valid email address'),
  role: projectRoleSchema.default('MEMBER'),
});

export const updateCollaboratorSchema = z.object({
  role: projectRoleSchema,
});

export const reorderProjectsSchema = z.object({
  projectIds: z.array(z.string()).min(1, 'At least one project ID is required'),
});

export const duplicateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ProjectParams = z.infer<typeof projectParamsSchema>;
export type ReorderProjectsInput = z.infer<typeof reorderProjectsSchema>;
export type DuplicateProjectInput = z.infer<typeof duplicateProjectSchema>;
export type ShareProjectInput = z.infer<typeof shareProjectSchema>;
export type UpdateCollaboratorInput = z.infer<typeof updateCollaboratorSchema>;
