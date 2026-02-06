import { z } from 'zod';

export const createFilterSchema = z.object({
  name: z.string().min(1, 'Filter name is required').max(200),
  query: z.string().min(1, 'Filter query is required').max(1000),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format').optional(),
  viewStyle: z.enum(['LIST', 'BOARD', 'CALENDAR']).optional(),
});

export const updateFilterSchema = z.object({
  name: z.string().min(1, 'Filter name is required').max(200).optional(),
  query: z.string().min(1, 'Filter query is required').max(1000).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format').optional(),
  isFavorite: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  viewStyle: z.enum(['LIST', 'BOARD', 'CALENDAR']).optional(),
});

export const filterParamsSchema = z.object({
  id: z.string().min(1, 'Filter ID is required'),
});

export const filterQuerySchema = z.object({
  query: z.string().min(1, 'Query is required').max(1000),
});

export type CreateFilterInput = z.infer<typeof createFilterSchema>;
export type UpdateFilterInput = z.infer<typeof updateFilterSchema>;
export type FilterParams = z.infer<typeof filterParamsSchema>;
export type FilterQueryInput = z.infer<typeof filterQuerySchema>;
