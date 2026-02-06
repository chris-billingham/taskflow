import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format').optional(),
  workspaceId: z.string().optional(),
  parentId: z.string().optional(),
  viewStyle: z.enum(['LIST', 'BOARD', 'CALENDAR']).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format').optional(),
  viewStyle: z.enum(['LIST', 'BOARD', 'CALENDAR']).optional(),
  isFavorite: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const projectParamsSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
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
