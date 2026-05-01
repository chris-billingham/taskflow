import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { changePasswordSchema } from '../schemas/auth.js';
import * as userService from '../services/userService.js';
import { ValidationError } from '../errors/index.js';

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  timezone: z.string().max(64).optional(),
  weekStart: z.number().int().min(0).max(6).optional(),
  dateFormat: z.string().max(32).nullable().optional(),
  timeFormat: z.string().max(32).nullable().optional(),
  theme: z.string().max(32).nullable().optional(),
});

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/me', async (request, reply) => {
    const data = await userService.getUserById(request.user.id);
    return reply.send({ success: true, data });
  });

  app.patch('/me', async (request, reply) => {
    const result = updateUserSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }
    const data = await userService.updateUser(request.user.id, result.data);
    return reply.send({ success: true, data });
  });

  app.patch('/me/password', async (request, reply) => {
    const result = changePasswordSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await userService.changePassword(
      request.user.id,
      result.data.currentPassword,
      result.data.newPassword,
    );
    return reply.send({ success: true, ...data });
  });

  app.delete('/me', async (request, reply) => {
    const data = await userService.deleteUser(request.user.id);
    return reply.send({ success: true, ...data });
  });
}
