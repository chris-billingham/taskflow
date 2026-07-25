import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../schemas/auth.js';
import * as authService from '../services/authService.js';
import { UnauthorizedError, ValidationError } from '../errors/index.js';
import { env } from '../config/env.js';

// Refresh token cookie is httpOnly + SameSite=Strict.
// SameSite=Strict prevents cross-origin requests from carrying the cookie,
// which eliminates CSRF for these endpoints without a separate CSRF token.
// All other API endpoints use Authorization: Bearer (not cookies), so they
// are not CSRF-vulnerable regardless.
const REFRESH_COOKIE = 'refreshToken';
const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
  maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
};

export async function authRoutes(app: FastifyInstance) {
  await app.register(rateLimit, {
    global: false,
  });

  app.post('/register', {
    config: {
      rateLimit: { max: env.NODE_ENV === 'production' ? 5 : 1000, timeWindow: '1 hour' },
    },
  }, async (request, reply) => {
    const result = registerSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const { user, accessToken, refreshToken } = await authService.register(result.data);
    reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
    return reply.status(201).send({ success: true, data: { user, accessToken } });
  });

  app.post('/login', {
    config: {
      rateLimit: { max: env.NODE_ENV === 'production' ? 5 : 1000, timeWindow: '15 minutes' },
    },
  }, async (request, reply) => {
    const result = loginSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const { user, accessToken, refreshToken } = await authService.login(
      result.data.email,
      result.data.password,
    );
    reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
    return reply.send({ success: true, data: { user, accessToken } });
  });

  app.post('/logout', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE];
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return reply.send({ success: true, message: 'Logged out successfully' });
  });

  app.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedError('No refresh token');
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await authService.refreshTokens(refreshToken);
    reply.setCookie(REFRESH_COOKIE, newRefreshToken, refreshCookieOptions);
    return reply.send({ success: true, data: { accessToken } });
  });

  app.post('/forgot-password', {
    config: {
      rateLimit: { max: env.NODE_ENV === 'production' ? 3 : 1000, timeWindow: '1 hour' },
    },
  }, async (request, reply) => {
    const result = forgotPasswordSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await authService.forgotPassword(result.data.email);
    return reply.send({ success: true, ...data });
  });

  app.post('/reset-password', {
    config: {
      rateLimit: { max: env.NODE_ENV === 'production' ? 5 : 1000, timeWindow: '1 hour' },
    },
  }, async (request, reply) => {
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

  app.post('/resend-verification', {
    config: {
      rateLimit: { max: env.NODE_ENV === 'production' ? 3 : 1000, timeWindow: '1 hour' },
    },
  }, async (request, reply) => {
    const result = forgotPasswordSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await authService.resendVerificationEmail(result.data.email);
    return reply.send({ success: true, ...data });
  });
}
