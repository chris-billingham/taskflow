import type { FastifyInstance } from 'fastify';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../schemas/auth.js';
import * as authService from '../services/authService.js';
import { ValidationError } from '../errors/index.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const result = registerSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await authService.register(result.data);
    return reply.status(201).send({ success: true, data });
  });

  app.post('/login', async (request, reply) => {
    const result = loginSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await authService.login(result.data.email, result.data.password);
    return reply.send({ success: true, data });
  });

  app.post('/logout', async (request, reply) => {
    const result = refreshSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    await authService.logout(result.data.refreshToken);
    return reply.send({ success: true, message: 'Logged out successfully' });
  });

  app.post('/refresh', async (request, reply) => {
    const result = refreshSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await authService.refreshTokens(result.data.refreshToken);
    return reply.send({ success: true, data });
  });

  app.post('/forgot-password', async (request, reply) => {
    const result = forgotPasswordSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await authService.forgotPassword(result.data.email);
    return reply.send({ success: true, ...data });
  });

  app.post('/reset-password', async (request, reply) => {
    const result = resetPasswordSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await authService.resetPassword(
      result.data.token,
      result.data.password,
    );
    return reply.send({ success: true, ...data });
  });

  app.get('/verify-email', async (request, reply) => {
    const { token } = request.query as { token?: string };
    if (!token) {
      throw new ValidationError('Token is required');
    }

    const data = await authService.verifyEmail(token);
    return reply.send({ success: true, ...data });
  });
}
