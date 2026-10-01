import { z } from 'zod';
import { clientId, ifVersion } from '../common.js';

export const createSectionSchema = z.object({
  id: clientId.optional(),
  name: z.string().min(1, 'Section name is required').max(200),
  projectId: z.string().min(1, 'Project ID is required'),
  sortOrder: z.number().int().optional(),
});

/** POST /projects/:projectId/sections: the project comes from the URL. */
export const createSectionBodySchema = createSectionSchema.omit({ projectId: true });

export const projectSectionsParamsSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
});

export const updateSectionSchema = z.object({
  ifVersion,
  name: z.string().min(1, 'Section name is required').max(200).optional(),
  sortOrder: z.number().int().optional(),
  isCollapsed: z.boolean().optional(),
});

export const sectionParamsSchema = z.object({
  id: z.string().min(1, 'Section ID is required'),
});

export const reorderSectionsSchema = z.object({
  sectionIds: z.array(z.string()).min(1, 'At least one section ID is required'),
});

export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
export type SectionParams = z.infer<typeof sectionParamsSchema>;
export type ReorderSectionsInput = z.infer<typeof reorderSectionsSchema>;
