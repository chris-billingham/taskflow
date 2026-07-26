import { z } from 'zod';

const systemRoleSchema = z.enum(['USER', 'ADMIN']);

// Passwords an admin sets on someone else's behalf follow the same floor as
// self-service ones (schemas/auth.ts). The upper bound exists because bcrypt
// silently truncates past 72 bytes — rejecting is honest, truncating is not.
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

export const listUsersQuerySchema = z.object({
  search: z.string().max(200).optional(),
  role: systemRoleSchema.optional(),
  // Query strings carry booleans as text.
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required').max(100),
  // Omit to have the server generate one and return it once.
  password: passwordSchema.optional(),
  role: systemRoleSchema.optional(),
});

export const setUserRoleSchema = z.object({
  role: systemRoleSchema,
});

export const setUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export const adminResetPasswordSchema = z.object({
  password: passwordSchema.optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
