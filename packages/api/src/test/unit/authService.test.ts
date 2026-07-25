import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database.js', () => {
  const mockPrismaClient = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    workspace: { create: vi.fn() },
    project: { create: vi.fn() },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  // Set after construction to avoid circular type-inference error
  mockPrismaClient.$transaction.mockImplementation(
    (fn: (tx: typeof mockPrismaClient) => unknown) => fn(mockPrismaClient),
  );
  return { prisma: mockPrismaClient };
});

vi.mock('../../utils/password.js', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock('../../utils/jwt.js', () => ({
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}));

vi.mock('../../config/redis.js', () => ({
  getRedis: vi.fn(() => ({
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  })),
}));

vi.mock('../../services/mailService.js', () => ({
  isMailerReady: vi.fn(() => false),
  sendVerificationEmail: vi.fn(() => Promise.resolve()),
  sendPasswordResetEmail: vi.fn(() => Promise.resolve()),
  sendWorkspaceInviteEmail: vi.fn(() => Promise.resolve()),
}));

import { createHash } from 'node:crypto';
import {
  register,
  login,
  logout,
  refreshTokens,
  verifyEmail,
  resendVerificationEmail,
} from '../../services/authService.js';
import {
  isMailerReady,
  sendVerificationEmail,
} from '../../services/mailService.js';
import { prisma } from '../../config/database.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/jwt.js';
import { ConflictError, UnauthorizedError, NotFoundError } from '../../errors/index.js';

const mockPrisma = prisma as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  workspace: { create: ReturnType<typeof vi.fn> };
  project: { create: ReturnType<typeof vi.fn> };
  refreshToken: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

const mockHashPassword = vi.mocked(hashPassword);
const mockVerifyPassword = vi.mocked(verifyPassword);
const mockGenerateAccessToken = vi.mocked(generateAccessToken);
const mockGenerateRefreshToken = vi.mocked(generateRefreshToken);
const mockVerifyRefreshToken = vi.mocked(verifyRefreshToken);
const mockIsMailerReady = vi.mocked(isMailerReady);
const mockSendVerificationEmail = vi.mocked(sendVerificationEmail);

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const TEST_USER = {
  id: 'user-abc',
  email: 'test@example.com',
  name: 'Test User',
  passwordHash: '$2b$12$hashedpw',
  emailVerified: true,
  emailVerifyToken: null,
};

describe('register', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue(TEST_USER);
    mockPrisma.workspace.create.mockResolvedValue({ id: 'ws-1' });
    mockPrisma.project.create.mockResolvedValue({ id: 'proj-1' });
    mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
    mockHashPassword.mockResolvedValue('$2b$12$hashedpw' as never);
    mockGenerateAccessToken.mockReturnValue('access-token-xyz');
    mockGenerateRefreshToken.mockReturnValue('refresh-token-xyz');
  });

  it('creates user, workspace, and inbox project', async () => {
    const result = await register({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    });

    expect(mockPrisma.user.create).toHaveBeenCalledOnce();
    expect(mockPrisma.workspace.create).toHaveBeenCalledOnce();
    expect(mockPrisma.project.create).toHaveBeenCalledOnce();
    expect(result.user).toMatchObject({
      id: TEST_USER.id,
      email: TEST_USER.email,
      name: TEST_USER.name,
    });
    expect(result.accessToken).toBe('access-token-xyz');
    expect(result.refreshToken).toBe('refresh-token-xyz');
  });

  it('hashes the password before storing', async () => {
    await register({ name: 'User', email: 'u@e.com', password: 'pw123' });
    expect(mockHashPassword).toHaveBeenCalledWith('pw123');
  });

  it('throws ConflictError when email already exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(TEST_USER);
    await expect(register({ name: 'User', email: 'test@example.com', password: 'pw' }))
      .rejects.toThrow(ConflictError);
  });

  it('auto-verifies the account when no mailer is available', async () => {
    mockIsMailerReady.mockReturnValue(false);
    await register({ name: 'User', email: 'u@e.com', password: 'pw123456' });

    const created = mockPrisma.user.create.mock.calls[0][0].data;
    expect(created.emailVerified).toBe(true);
    expect(created.emailVerifyToken).toBeNull();
    expect(mockSendVerificationEmail).not.toHaveBeenCalled();
  });

  it('requires verification and emails a token when the mailer is ready', async () => {
    mockIsMailerReady.mockReturnValue(true);
    await register({ name: 'User', email: 'u@e.com', password: 'pw123456' });

    const created = mockPrisma.user.create.mock.calls[0][0].data;
    expect(created.emailVerified).toBe(false);
    expect(created.emailVerifyTokenExpiresAt).toBeInstanceOf(Date);

    await vi.waitFor(() => expect(mockSendVerificationEmail).toHaveBeenCalledOnce());
    const [to, , rawToken] = mockSendVerificationEmail.mock.calls[0];
    // The service emails the created user row (mocked as TEST_USER here).
    expect(to).toBe(TEST_USER.email);
    // The DB stores only the hash of the token that was emailed.
    expect(created.emailVerifyToken).toBe(sha256(rawToken));
    expect(created.emailVerifyToken).not.toBe(rawToken);
  });
});

describe('login', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(TEST_USER);
    mockPrisma.user.update.mockResolvedValue(TEST_USER);
    mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
    mockVerifyPassword.mockResolvedValue(true as never);
    mockGenerateAccessToken.mockReturnValue('access-token');
    mockGenerateRefreshToken.mockReturnValue('refresh-token');
  });

  it('returns user and tokens on valid credentials', async () => {
    const result = await login('test@example.com', 'correct-password');
    expect(result.user.email).toBe('test@example.com');
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
  });

  it('updates lastLoginAt on successful login', async () => {
    await login('test@example.com', 'correct-password');
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TEST_USER.id },
        data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
      }),
    );
  });

  it('throws UnauthorizedError when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(login('nobody@example.com', 'pw')).rejects.toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError when password is wrong', async () => {
    mockVerifyPassword.mockResolvedValue(false as never);
    await expect(login('test@example.com', 'wrong')).rejects.toThrow(UnauthorizedError);
  });

  it('does not reveal whether user exists in error message', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const err = await login('nobody@example.com', 'pw').catch((e) => e);
    expect(err.message).toBe('Invalid email or password');
  });

  it('throws UnauthorizedError when email is not verified', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...TEST_USER, emailVerified: false });
    await expect(login('test@example.com', 'correct-password')).rejects.toThrow(UnauthorizedError);
  });
});

describe('logout', () => {
  it('deletes the refresh token from the database', async () => {
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    await logout('some-refresh-token');
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 'some-refresh-token' },
    });
  });
});

describe('refreshTokens', () => {
  const storedToken = {
    id: 'stored-rt-id',
    token: 'valid-refresh-token',
    userId: TEST_USER.id,
    expiresAt: new Date(Date.now() + 86400000), // 1 day from now
  };

  beforeEach(() => {
    mockVerifyRefreshToken.mockReturnValue({
      id: TEST_USER.id,
      email: TEST_USER.email,
      name: TEST_USER.name,
    } as never);
    mockPrisma.refreshToken.findUnique.mockResolvedValue(storedToken);
    mockPrisma.user.findUnique.mockResolvedValue(TEST_USER);
    mockPrisma.refreshToken.delete.mockResolvedValue(storedToken);
    mockPrisma.refreshToken.create.mockResolvedValue({ id: 'new-rt' });
    mockGenerateAccessToken.mockReturnValue('new-access-token');
    mockGenerateRefreshToken.mockReturnValue('new-refresh-token');
  });

  it('returns new token pair on valid refresh token', async () => {
    const result = await refreshTokens('valid-refresh-token');
    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toBe('new-refresh-token');
  });

  it('deletes old token before issuing new one (rotation)', async () => {
    await refreshTokens('valid-refresh-token');
    expect(mockPrisma.refreshToken.delete).toHaveBeenCalledWith({
      where: { id: storedToken.id },
    });
  });

  it('throws UnauthorizedError when token verification fails', async () => {
    mockVerifyRefreshToken.mockReturnValue(null as never);
    await expect(refreshTokens('invalid-token')).rejects.toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError when token not found in DB (reuse detection)', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue(null);
    await expect(refreshTokens('valid-refresh-token')).rejects.toThrow(UnauthorizedError);
  });

  it('invalidates all tokens on reuse detection', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue(null);
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });
    await expect(refreshTokens('reused-token')).rejects.toThrow();
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: TEST_USER.id },
    });
  });

  it('throws UnauthorizedError when token is expired', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      ...storedToken,
      expiresAt: new Date(Date.now() - 1000), // expired
    });
    await expect(refreshTokens('valid-refresh-token')).rejects.toThrow(UnauthorizedError);
  });
});

describe('verifyEmail', () => {
  const RAW_TOKEN = 'verify-token-123';
  const unverifiedUser = {
    ...TEST_USER,
    id: 'user-1',
    emailVerified: false,
    emailVerifyToken: sha256(RAW_TOKEN),
    emailVerifyTokenExpiresAt: new Date(Date.now() + 60_000),
  };

  it('looks the token up by its hash, never the raw value', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(unverifiedUser);
    mockPrisma.user.update.mockResolvedValue({ ...unverifiedUser, emailVerified: true });

    await verifyEmail(RAW_TOKEN);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { emailVerifyToken: sha256(RAW_TOKEN) },
    });
  });

  it('marks email as verified and clears token + expiry', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(unverifiedUser);
    mockPrisma.user.update.mockResolvedValue({ ...unverifiedUser, emailVerified: true });

    const result = await verifyEmail(RAW_TOKEN);
    expect(result.message).toBe('Email verified successfully');
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          emailVerified: true,
          emailVerifyToken: null,
          emailVerifyTokenExpiresAt: null,
        },
      }),
    );
  });

  it('throws NotFoundError for an unknown token', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(verifyEmail('bad-token')).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError for an expired token', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...unverifiedUser,
      emailVerifyTokenExpiresAt: new Date(Date.now() - 1000),
    });
    await expect(verifyEmail(RAW_TOKEN)).rejects.toThrow(NotFoundError);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe('resendVerificationEmail', () => {
  const unverified = { ...TEST_USER, emailVerified: false };
  const NEUTRAL = 'If that email exists and is unverified, a new link has been sent';

  beforeEach(() => {
    mockPrisma.user.update.mockResolvedValue(unverified);
  });

  it('rotates the stored hash and emails the new raw token', async () => {
    mockIsMailerReady.mockReturnValue(true);
    mockPrisma.user.findUnique.mockResolvedValue(unverified);

    const result = await resendVerificationEmail(TEST_USER.email);
    expect(result.message).toBe(NEUTRAL);

    await vi.waitFor(() => expect(mockSendVerificationEmail).toHaveBeenCalledOnce());
    const raw = mockSendVerificationEmail.mock.calls[0][2];
    const stored = mockPrisma.user.update.mock.calls[0][0].data;
    expect(stored.emailVerifyToken).toBe(sha256(raw));
    expect(stored.emailVerifyTokenExpiresAt).toBeInstanceOf(Date);
  });

  it('returns the neutral message for unknown or verified emails', async () => {
    mockIsMailerReady.mockReturnValue(true);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const result = await resendVerificationEmail('nobody@example.com');
    expect(result.message).toBe(NEUTRAL);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockSendVerificationEmail).not.toHaveBeenCalled();
  });

  it('does not rotate the token when no mailer is available', async () => {
    mockIsMailerReady.mockReturnValue(false);
    mockPrisma.user.findUnique.mockResolvedValue(unverified);
    const result = await resendVerificationEmail(TEST_USER.email);
    expect(result.message).toBe(NEUTRAL);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
