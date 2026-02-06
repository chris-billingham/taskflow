import { z } from 'zod';

export const createSectionSchema = z.object({
  name: z.string().min(1, 'Section name is required').max(200),
  projectId: z.string().min(1, 'Project ID is required'),
  sortOrder: z.number().int().optional(),
});

export const updateSectionSchema = z.object({
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
