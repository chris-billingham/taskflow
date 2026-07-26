import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { generateAccessToken } from '../../utils/jwt.js';

// requireAdmin re-reads the caller's role from the database on every request,
// so the route suite needs prisma stubbed even though the service is mocked.
vi.mock('../../config/database.js', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

vi.mock('../../services/adminService.js', () => ({
  listUsers: vi.fn(),
  getUserDetail: vi.fn(),
  getStats: vi.fn(),
  createUser: vi.fn(),
  setUserRole: vi.fn(),
  setUserActive: vi.fn(),
  resetUserPassword: vi.fn(),
  deleteUser: vi.fn(),
}));

import { prisma } from '../../config/database.js';
import * as adminService from '../../services/adminService.js';
import { adminRoutes } from '../../routes/admin.js';
import { ConflictError, ValidationError } from '../../errors/index.js';

const mockUserFindUnique = (prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
}).user.findUnique;

const ADMIN = { id: 'admin-1', email: 'admin@example.com', name: 'Admin' };
const ADMIN_TOKEN = generateAccessToken(ADMIN);

const SAMPLE_USER = {
  id: 'user-2',
  email: 'user@example.com',
  name: 'Regular User',
  avatarUrl: null,
  role: 'USER',
  isActive: true,
  emailVerified: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastLoginAt: null,
};

let app: FastifyInstance;

const authed = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
) =>
  app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

beforeAll(async () => {
  app = Fastify({ logger: false });

  app.setErrorHandler(
    (
      error: Error & { statusCode?: number; code?: string; validation?: unknown },
      _request,
      reply,
    ) => {
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
    },
  );

  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  // Default: the caller is a live administrator.
  mockUserFindUnique.mockResolvedValue({ role: 'ADMIN', isActive: true });
});

describe('admin route authorization', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/admin/users' });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a valid token belonging to a non-admin', async () => {
    mockUserFindUnique.mockResolvedValue({ role: 'USER', isActive: true });

    const response = await authed('GET', '/api/v1/admin/users');

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('FORBIDDEN');
    expect(adminService.listUsers).not.toHaveBeenCalled();
  });

  it('rejects an admin whose account was suspended mid-session', async () => {
    // The JWT is still cryptographically valid for up to 15 minutes; the
    // database is the authority, so the console must close immediately.
    mockUserFindUnique.mockResolvedValue({ role: 'ADMIN', isActive: false });

    const response = await authed('GET', '/api/v1/admin/users');

    expect(response.statusCode).toBe(401);
    expect(adminService.listUsers).not.toHaveBeenCalled();
  });

  it('rejects a token whose account no longer exists', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const response = await authed('GET', '/api/v1/admin/users');
    expect(response.statusCode).toBe(401);
  });

  it('rejects a demoted admin on their very next request', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ role: 'ADMIN', isActive: true });
    vi.mocked(adminService.listUsers).mockResolvedValue({
      users: [],
      total: 0,
      page: 1,
      limit: 25,
      pages: 1,
    } as never);
    expect((await authed('GET', '/api/v1/admin/users')).statusCode).toBe(200);

    mockUserFindUnique.mockResolvedValue({ role: 'USER', isActive: true });
    expect((await authed('GET', '/api/v1/admin/users')).statusCode).toBe(403);
  });

  it('guards every mutating endpoint, not just the list', async () => {
    mockUserFindUnique.mockResolvedValue({ role: 'USER', isActive: true });

    const responses = await Promise.all([
      authed('POST', '/api/v1/admin/users', { email: 'a@b.com', name: 'A' }),
      authed('PATCH', '/api/v1/admin/users/user-2/role', { role: 'ADMIN' }),
      authed('PATCH', '/api/v1/admin/users/user-2/status', { isActive: false }),
      authed('POST', '/api/v1/admin/users/user-2/password', {}),
      authed('DELETE', '/api/v1/admin/users/user-2'),
      authed('GET', '/api/v1/admin/stats'),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(403);
    }
  });
});

describe('GET /api/v1/admin/users', () => {
  it('returns the page and forwards the parsed query', async () => {
    vi.mocked(adminService.listUsers).mockResolvedValue({
      users: [SAMPLE_USER],
      total: 1,
      page: 2,
      limit: 10,
      pages: 1,
    } as never);

    const response = await authed(
      'GET',
      '/api/v1/admin/users?search=ada&page=2&limit=10&isActive=false&role=ADMIN',
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().data.users).toHaveLength(1);
    expect(adminService.listUsers).toHaveBeenCalledWith({
      search: 'ada',
      page: 2,
      limit: 10,
      // Query strings carry booleans as text; the schema coerces them.
      isActive: false,
      role: 'ADMIN',
    });
  });

  it('rejects a limit above the cap', async () => {
    const response = await authed('GET', '/api/v1/admin/users?limit=500');
    expect(response.statusCode).toBe(400);
  });

  it('rejects an unknown role filter', async () => {
    const response = await authed('GET', '/api/v1/admin/users?role=SUPERUSER');
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/v1/admin/users', () => {
  it('creates a user and returns the generated password once', async () => {
    vi.mocked(adminService.createUser).mockResolvedValue({
      user: SAMPLE_USER,
      temporaryPassword: 'Generated-Pass-1234',
    } as never);

    const response = await authed('POST', '/api/v1/admin/users', {
      email: 'new@example.com',
      name: 'New User',
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.temporaryPassword).toBe('Generated-Pass-1234');
  });

  it('rejects an invalid email', async () => {
    const response = await authed('POST', '/api/v1/admin/users', {
      email: 'not-an-email',
      name: 'New User',
    });
    expect(response.statusCode).toBe(400);
    expect(adminService.createUser).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 8 characters', async () => {
    const response = await authed('POST', '/api/v1/admin/users', {
      email: 'new@example.com',
      name: 'New User',
      password: 'short',
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a password bcrypt would silently truncate', async () => {
    const response = await authed('POST', '/api/v1/admin/users', {
      email: 'new@example.com',
      name: 'New User',
      password: 'x'.repeat(73),
    });
    expect(response.statusCode).toBe(400);
  });

  it('maps a duplicate email to 409', async () => {
    vi.mocked(adminService.createUser).mockRejectedValue(
      new ConflictError('A user with this email already exists'),
    );

    const response = await authed('POST', '/api/v1/admin/users', {
      email: 'dupe@example.com',
      name: 'Dupe',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('CONFLICT');
  });
});

describe('PATCH /api/v1/admin/users/:id/role', () => {
  it('forwards the requested role', async () => {
    vi.mocked(adminService.setUserRole).mockResolvedValue(SAMPLE_USER as never);

    const response = await authed('PATCH', '/api/v1/admin/users/user-2/role', {
      role: 'ADMIN',
    });

    expect(response.statusCode).toBe(200);
    expect(adminService.setUserRole).toHaveBeenCalledWith('user-2', 'ADMIN');
  });

  it('rejects a role outside the enum', async () => {
    const response = await authed('PATCH', '/api/v1/admin/users/user-2/role', {
      role: 'ROOT',
    });
    expect(response.statusCode).toBe(400);
    expect(adminService.setUserRole).not.toHaveBeenCalled();
  });

  it('surfaces the last-admin guard as 409', async () => {
    vi.mocked(adminService.setUserRole).mockRejectedValue(
      new ConflictError('Cannot demote the last active administrator.'),
    );

    const response = await authed('PATCH', '/api/v1/admin/users/user-2/role', {
      role: 'USER',
    });

    expect(response.statusCode).toBe(409);
  });
});

describe('PATCH /api/v1/admin/users/:id/status', () => {
  it('passes the acting admin id through so self-suspension can be refused', async () => {
    vi.mocked(adminService.setUserActive).mockResolvedValue(SAMPLE_USER as never);

    const response = await authed('PATCH', '/api/v1/admin/users/user-2/status', {
      isActive: false,
    });

    expect(response.statusCode).toBe(200);
    expect(adminService.setUserActive).toHaveBeenCalledWith(ADMIN.id, 'user-2', false);
  });

  it('rejects a non-boolean status', async () => {
    const response = await authed('PATCH', '/api/v1/admin/users/user-2/status', {
      isActive: 'nope',
    });
    expect(response.statusCode).toBe(400);
  });

  it('surfaces self-suspension as 400', async () => {
    vi.mocked(adminService.setUserActive).mockRejectedValue(
      new ValidationError('You cannot deactivate your own account'),
    );

    const response = await authed('PATCH', `/api/v1/admin/users/${ADMIN.id}/status`, {
      isActive: false,
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/v1/admin/users/:id/password', () => {
  it('resets with a generated password when the body is empty', async () => {
    vi.mocked(adminService.resetUserPassword).mockResolvedValue({
      temporaryPassword: 'Fresh-Pass-9876',
      message: 'Password reset.',
    } as never);

    const response = await authed('POST', '/api/v1/admin/users/user-2/password', {});

    expect(response.statusCode).toBe(200);
    expect(response.json().data.temporaryPassword).toBe('Fresh-Pass-9876');
    expect(adminService.resetUserPassword).toHaveBeenCalledWith('user-2', undefined);
  });

  it('accepts an explicit password', async () => {
    vi.mocked(adminService.resetUserPassword).mockResolvedValue({
      temporaryPassword: null,
      message: 'Password reset.',
    } as never);

    const response = await authed('POST', '/api/v1/admin/users/user-2/password', {
      password: 'a-chosen-password',
    });

    expect(response.statusCode).toBe(200);
    expect(adminService.resetUserPassword).toHaveBeenCalledWith(
      'user-2',
      'a-chosen-password',
    );
  });

  it('rejects a too-short password', async () => {
    const response = await authed('POST', '/api/v1/admin/users/user-2/password', {
      password: 'tiny',
    });
    expect(response.statusCode).toBe(400);
    expect(adminService.resetUserPassword).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/admin/users/:id', () => {
  it('passes the acting admin id so self-deletion can be refused', async () => {
    vi.mocked(adminService.deleteUser).mockResolvedValue({
      message: 'Account deleted successfully',
    } as never);

    const response = await authed('DELETE', '/api/v1/admin/users/user-2');

    expect(response.statusCode).toBe(200);
    expect(adminService.deleteUser).toHaveBeenCalledWith(ADMIN.id, 'user-2');
  });

  it('surfaces the shared-workspace guard as 409', async () => {
    vi.mocked(adminService.deleteUser).mockRejectedValue(
      new ConflictError('You still own shared workspace(s) with other members'),
    );

    const response = await authed('DELETE', '/api/v1/admin/users/user-2');

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toMatch(/shared workspace/i);
  });
});

describe('GET /api/v1/admin/stats', () => {
  it('returns instance counts', async () => {
    vi.mocked(adminService.getStats).mockResolvedValue({
      total: 4,
      active: 3,
      suspended: 1,
      admins: 1,
      unverified: 0,
    } as never);

    const response = await authed('GET', '/api/v1/admin/stats');

    expect(response.statusCode).toBe(200);
    expect(response.json().data.total).toBe(4);
  });
});
