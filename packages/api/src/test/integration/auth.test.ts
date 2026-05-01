import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

vi.mock('../../services/authService.js', () => ({
  register: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  refreshTokens: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  verifyEmail: vi.fn(),
}));

import * as authService from '../../services/authService.js';
import { authRoutes } from '../../routes/auth.js';
import { ConflictError, UnauthorizedError, ValidationError } from '../../errors/index.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string; validation?: unknown }, _request, reply) => {
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        success: false,
        error: error.code ?? 'ERROR',
        message: error.message,
      });
    }
    return reply.status(500).send({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: error.message,
    });
  });

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('POST /api/v1/auth/register', () => {
  it('returns 201 with user and tokens on success', async () => {
    vi.mocked(authService.register).mockResolvedValue({
      user: { id: 'u1', email: 'new@example.com', name: 'New User' },
      accessToken: 'access-tok',
      refreshToken: 'refresh-tok',
    } as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'New User',
        email: 'new@example.com',
        password: 'Password123!',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe('new@example.com');
    expect(body.data.accessToken).toBe('access-tok');
  });

  it('returns 409 when email already exists', async () => {
    vi.mocked(authService.register).mockRejectedValue(
      new ConflictError('A user with this email already exists'),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { name: 'User', email: 'existing@example.com', password: 'Pass123!' },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('CONFLICT');
  });

  it('returns 400 for missing required fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'test@example.com' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().success).toBe(false);
  });

  it('returns 400 for invalid email format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { name: 'User', email: 'not-an-email', password: 'Pass123!' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns 200 with user and tokens on valid credentials', async () => {
    vi.mocked(authService.login).mockResolvedValue({
      user: { id: 'u1', email: 'user@example.com', name: 'User' },
      accessToken: 'access',
      refreshToken: 'refresh',
    } as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'user@example.com', password: 'Password123!' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBe('access');
  });

  it('returns 401 for invalid credentials', async () => {
    vi.mocked(authService.login).mockRejectedValue(
      new UnauthorizedError('Invalid email or password'),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'user@example.com', password: 'wrong' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe('UNAUTHORIZED');
  });

  it('returns 400 for missing password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'user@example.com' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('returns 200 on success', async () => {
    vi.mocked(authService.logout).mockResolvedValue(undefined as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken: 'some-refresh-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('returns 200 with new tokens', async () => {
    vi.mocked(authService.refreshTokens).mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    } as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: 'old-refresh-token' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.accessToken).toBe('new-access');
  });

  it('returns 401 for invalid refresh token', async () => {
    vi.mocked(authService.refreshTokens).mockRejectedValue(
      new UnauthorizedError('Refresh token expired or already used'),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: 'expired-token' },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /api/v1/auth/verify-email', () => {
  it('returns 200 on valid token', async () => {
    vi.mocked(authService.verifyEmail).mockResolvedValue({
      message: 'Email verified successfully',
    } as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/verify-email?token=valid-token',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });

  it('returns 400 when token query param is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/verify-email',
    });

    expect(response.statusCode).toBe(400);
  });
});
