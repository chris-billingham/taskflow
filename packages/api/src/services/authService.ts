import crypto from 'node:crypto';
import { prisma } from '../config/database.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  type TokenPayload,
} from '../utils/jwt.js';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../errors/index.js';
import type { RegisterInput } from '../schemas/auth.js';
import { disconnectUserSockets } from '../websocket/events.js';
import {
  isMailerReady,
  sendVerificationEmail,
  sendPasswordResetEmail,
} from './mailService.js';

const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Email delivery must never fail the request that triggered it — the user can
// always use "resend"/"forgot password" if a send is dropped.
function sendInBackground(label: string, fn: () => Promise<void>) {
  void fn().catch((err) => {
    console.error(`[mail] ${label} failed:`, err instanceof Error ? err.message : err);
  });
}

function tokenPayload(user: {
  id: string;
  email: string;
  name: string;
}): TokenPayload {
  return { id: user.id, email: user.email, name: user.name };
}

async function createTokenPair(user: {
  id: string;
  email: string;
  name: string;
}) {
  const payload = tokenPayload(user);
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      // Only the hash is stored: a leaked backup or DB read must not yield
      // directly replayable 30-day credentials (reset tokens were already
      // hashed; refresh tokens now match).
      token: sha256(refreshToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  return { accessToken, refreshToken };
}

export async function register(data: RegisterInput) {
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existing) {
    throw new ConflictError('A user with this email already exists');
  }

  const passwordHash = await hashPassword(data.password);
  // Verification is required only when the mailer PROVED itself at boot
  // (transport verified) — gating on config alone would lock every new user
  // out of their account whenever SMTP is set but broken, because the
  // verification link could never arrive.
  const emailConfigured = isMailerReady();
  const rawVerifyToken = emailConfigured ? crypto.randomBytes(32).toString('hex') : null;

  // Create the user, their personal workspace, and their inbox project atomically.
  // If any step fails, none are persisted — otherwise a user could exist with no
  // inbox, which permanently breaks quick-add ("No default project found").
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        // Only the hash is stored; the raw token exists solely in the email.
        emailVerifyToken: rawVerifyToken ? sha256(rawVerifyToken) : null,
        emailVerifyTokenExpiresAt: rawVerifyToken
          ? new Date(Date.now() + VERIFY_TOKEN_TTL_MS)
          : null,
        emailVerified: !emailConfigured,
      },
    });

    const workspace = await tx.workspace.create({
      data: {
        name: 'Personal',
        slug: `personal-${created.id}`,
        ownerId: created.id,
        members: {
          create: { userId: created.id, role: 'OWNER' },
        },
      },
    });

    await tx.project.create({
      data: {
        name: 'Inbox',
        ownerId: created.id,
        workspaceId: workspace.id,
        isInbox: true,
      },
    });

    return created;
  });

  if (rawVerifyToken) {
    sendInBackground('verification email', () =>
      sendVerificationEmail(user.email, user.name, rawVerifyToken),
    );
  }

  const tokens = await createTokenPair(user);

  return {
    user: { id: user.id, email: user.email, name: user.name },
    ...tokens,
  };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.emailVerified) {
    throw new UnauthorizedError('Please verify your email address before signing in');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const tokens = await createTokenPair(user);

  return {
    user: { id: user.id, email: user.email, name: user.name },
    ...tokens,
  };
}

export async function logout(refreshToken: string) {
  await prisma.refreshToken.deleteMany({ where: { token: sha256(refreshToken) } });
}

export async function refreshTokens(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);
  if (!payload) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  // Use a transaction so the find + delete is atomic, eliminating the race
  // window where two concurrent requests could both succeed with the same token.
  const result = await prisma.$transaction(async (tx) => {
    const stored = await tx.refreshToken.findUnique({
      where: { token: sha256(refreshToken) },
    });
    if (!stored || stored.expiresAt < new Date()) {
      // Token missing or expired — possible reuse attack; revoke all user
      // tokens and kill any live sockets they authenticate.
      if (payload.id) {
        await tx.refreshToken.deleteMany({ where: { userId: payload.id } });
        disconnectUserSockets(payload.id);
      }
      throw new UnauthorizedError('Refresh token expired or already used');
    }

    // Delete before issuing new pair so concurrent reuse fails
    await tx.refreshToken.delete({ where: { id: stored.id } });

    const user = await tx.user.findUnique({ where: { id: stored.userId } });
    if (!user) throw new UnauthorizedError('User not found');

    return user;
  });

  return createTokenPair(result);
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Don't reveal whether the email exists
    return { message: 'If that email exists, a reset link has been sent' };
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Store hashed token in Redis with 1-hour expiry
  const { getRedis } = await import('../config/redis.js');
  const redis = getRedis();
  await redis.set(`password-reset:${resetTokenHash}`, user.id, 'EX', 3600);

  if (isMailerReady()) {
    sendInBackground('password reset email', () =>
      sendPasswordResetEmail(user.email, user.name, resetToken),
    );
  } else if (process.env.NODE_ENV !== 'production') {
    console.warn(`[DEV] Password reset token for ${email}: ${resetToken}`);
  }
  return { message: 'If that email exists, a reset link has been sent' };
}

export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const { getRedis } = await import('../config/redis.js');
  const redis = getRedis();
  const userId = await redis.get(`password-reset:${tokenHash}`);

  if (!userId) {
    throw new ValidationError('Invalid or expired reset token');
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  // Invalidate the reset token
  await redis.del(`password-reset:${tokenHash}`);

  // Invalidate all refresh tokens for this user and kill live sockets —
  // a password reset means the old credentials may be compromised.
  await prisma.refreshToken.deleteMany({ where: { userId } });
  disconnectUserSockets(userId);

  return { message: 'Password has been reset' };
}

export async function verifyEmail(token: string) {
  // Tokens are stored hashed; the unique index makes this lookup O(1).
  const user = await prisma.user.findUnique({
    where: { emailVerifyToken: sha256(token) },
  });

  if (
    !user ||
    !user.emailVerifyTokenExpiresAt ||
    user.emailVerifyTokenExpiresAt < new Date()
  ) {
    throw new NotFoundError('Invalid or expired verification token');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      emailVerifyToken: null,
      emailVerifyTokenExpiresAt: null,
    },
  });

  return { message: 'Email verified successfully' };
}

export async function resendVerificationEmail(email: string) {
  const neutral = {
    message: 'If that email exists and is unverified, a new link has been sent',
  };

  const user = await prisma.user.findUnique({ where: { email } });
  // Don't reveal whether the email exists
  if (!user || user.emailVerified) {
    return neutral;
  }

  // Without a working mailer there is nothing useful to rotate or send.
  if (!isMailerReady()) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[DEV] resend requested for ${email} but no mailer is configured`);
    }
    return neutral;
  }

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifyToken: sha256(token),
      emailVerifyTokenExpiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    },
  });

  sendInBackground('verification email (resend)', () =>
    sendVerificationEmail(user.email, user.name, token),
  );

  return neutral;
}
