import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  listUsersQuerySchema,
  createUserSchema,
  setUserRoleSchema,
  setUserStatusSchema,
  adminResetPasswordSchema,
} from '../schemas/admin.js';
import * as adminService from '../services/adminService.js';
import { ValidationError } from '../errors/index.js';
import { env } from '../config/env.js';

/**
 * Instance administration. Every route here is gated by authenticate (valid
 * token) then requireAdmin (fresh database read of role + isActive).
 */
export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requireAdmin);

  app.get('/stats', async (_request, reply) => {
    const data = await adminService.getStats();
    return reply.send({ success: true, data });
  });

  app.get('/users', async (request, reply) => {
    const result = listUsersQuerySchema.safeParse(request.query);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }
    const data = await adminService.listUsers(result.data);
    return reply.send({ success: true, data });
  });

  app.get('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await adminService.getUserDetail(id);
    return reply.send({ success: true, data });
  });

  app.post(
    '/users',
    {
      config: {
        rateLimit: {
          max: env.NODE_ENV === 'production' ? 30 : 1000,
          timeWindow: '1 hour',
        },
      },
    },
    async (request, reply) => {
      const result = createUserSchema.safeParse(request.body);
      if (!result.success) {
        throw new ValidationError(result.error.issues[0].message);
      }
      const data = await adminService.createUser(result.data);
      return reply.status(201).send({ success: true, data });
    },
  );

  app.patch('/users/:id/role', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = setUserRoleSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }
    const data = await adminService.setUserRole(id, result.data.role);
    return reply.send({ success: true, data });
  });

  app.patch('/users/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = setUserStatusSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }
    const data = await adminService.setUserActive(
      request.user.id,
      id,
      result.data.isActive,
    );
    return reply.send({ success: true, data });
  });

  app.post(
    '/users/:id/password',
    {
      config: {
        rateLimit: {
          max: env.NODE_ENV === 'production' ? 20 : 1000,
          timeWindow: '1 hour',
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = adminResetPasswordSchema.safeParse(request.body ?? {});
      if (!result.success) {
        throw new ValidationError(result.error.issues[0].message);
      }
      // The generated password is in this response body and nowhere else —
      // it is never logged and cannot be retrieved again.
      const data = await adminService.resetUserPassword(id, result.data.password);
      return reply.send({ success: true, data });
    },
  );

  app.delete('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await adminService.deleteUser(request.user.id, id);
    return reply.send({ success: true, ...data });
  });
}
