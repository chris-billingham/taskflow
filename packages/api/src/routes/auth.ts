import type { FastifyInstance } from 'fastify';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../schemas/auth.js';
import * as authService from '../services/authService.js';
import * as instanceSettings from '../services/instanceSettingsService.js';
import { UnauthorizedError, ValidationError } from '../errors/index.js';
import { env } from '../config/env.js';
import { rateLimitMax } from '../config/rateLimits.js';

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
  app.post('/register', {
    config: {
      rateLimit: { max: rateLimitMax(5), timeWindow: '1 hour' },
    },
  }, async (request, reply) => {
    const result = registerSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const registered = await authService.register(result.data);
    if (registered.verificationRequired) {
      // Account created, verification email sent; no session until verified.
      return reply
        .status(201)
        .send({ success: true, data: { user: registered.user, verificationRequired: true } });
    }
    reply.setCookie(REFRESH_COOKIE, registered.refreshToken, refreshCookieOptions);
    return reply.status(201).send({
      success: true,
      data: { user: registered.user, accessToken: registered.accessToken, verificationRequired: false },
    });
  });

  app.post('/login', {
    config: {
      rateLimit: { max: rateLimitMax(5), timeWindow: '15 minutes' },
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

  // Public: lets the sign-in page decide whether to offer "Sign up". `open` is
  // also true on a brand-new install, whose first account is always allowed.
  app.get('/registration', async (_request, reply) => {
    const [mode, open] = await Promise.all([
      instanceSettings.getRegistrationMode(),
      instanceSettings.isRegistrationOpen(),
    ]);
    return reply.send({ success: true, data: { mode, open } });
  });

  app.post('/forgot-password', {
    config: {
      rateLimit: { max: rateLimitMax(3), timeWindow: '1 hour' },
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
      rateLimit: { max: rateLimitMax(5), timeWindow: '1 hour' },
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

  // POST with the token in the body: as a GET query string it was written to
  // every access log between the browser and the API.
  app.post('/verify-email', {
    config: {
      // Tokens must not be brute-forceable and the lookup shouldn't be a free
      // DoS lever.
      rateLimit: { max: rateLimitMax(10), timeWindow: '15 minutes' },
    },
  }, async (request, reply) => {
    const result = verifyEmailSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await authService.verifyEmail(result.data.token);
    return reply.send({ success: true, ...data });
  });

  app.post('/resend-verification', {
    config: {
      rateLimit: { max: rateLimitMax(3), timeWindow: '1 hour' },
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
