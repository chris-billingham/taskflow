import { z } from 'zod';

export const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(200),
  description: z.string().max(1000).optional(),
  projectId: z.string().min(1, 'Source project ID is required'),
  // NOTE: isPublic is deliberately NOT accepted from clients — the public
  // gallery is instance-wide, so a user-settable flag let anyone publish
  // arbitrary content into every other user's template picker.
  workspaceId: z.string().optional(),
});

export const applyTemplateSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  workspaceId: z.string().optional(),
});

export const updateTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(200).optional(),
  description: z.string().max(1000).optional(),
});

export const templateParamsSchema = z.object({
  id: z.string().min(1, 'Template ID is required'),
});

export const workspaceTemplateParamsSchema = z.object({
  id: z.string().min(1, 'Workspace ID is required'),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type ApplyTemplateInput = z.infer<typeof applyTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type TemplateParams = z.infer<typeof templateParamsSchema>;
