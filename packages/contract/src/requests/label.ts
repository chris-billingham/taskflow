import { z } from 'zod';

export const createLabelSchema = z.object({
  name: z.string().min(1, 'Label name is required').max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format').optional(),
});

export const updateLabelSchema = z.object({
  name: z.string().min(1, 'Label name is required').max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format').optional(),
  isFavorite: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const labelParamsSchema = z.object({
  id: z.string().min(1, 'Label ID is required'),
});

export const reorderLabelsSchema = z.object({
  labelIds: z.array(z.string()).min(1, 'At least one label ID is required'),
});

export type CreateLabelInput = z.infer<typeof createLabelSchema>;
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;
export type LabelParams = z.infer<typeof labelParamsSchema>;
export type ReorderLabelsInput = z.infer<typeof reorderLabelsSchema>;
