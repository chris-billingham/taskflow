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
      token: refreshToken,
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
  // When SMTP is not configured, auto-verify so users can log in immediately.
  // Once email delivery is implemented, remove this flag and let verifyEmail() set it.
  const emailConfigured = !!process.env.SMTP_HOST;
  const emailVerifyToken = emailConfigured ? crypto.randomBytes(32).toString('hex') : null;

  // Create the user, their personal workspace, and their inbox project atomically.
  // If any step fails, none are persisted — otherwise a user could exist with no
  // inbox, which permanently breaks quick-add ("No default project found").
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        emailVerifyToken,
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
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
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
      where: { token: refreshToken },
    });
    if (!stored || stored.expiresAt < new Date()) {
      // Token missing or expired — possible reuse attack; revoke all user tokens
      if (payload.id) {
        await tx.refreshToken.deleteMany({ where: { userId: payload.id } });
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

  // TODO: send email with reset link here (email delivery on roadmap)
  if (process.env.NODE_ENV !== 'production') {
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

  // Invalidate all refresh tokens for this user
  await prisma.refreshToken.deleteMany({ where: { userId } });

  return { message: 'Password has been reset' };
}

export async function verifyEmail(token: string) {
  const user = await prisma.user.findFirst({
    where: { emailVerifyToken: token },
  });

  if (!user) {
    throw new NotFoundError('Invalid verification token');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerifyToken: null },
  });

  return { message: 'Email verified successfully' };
}

export async function resendVerificationEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Don't reveal whether the email exists
  if (!user || user.emailVerified) {
    return { message: 'If that email exists and is unverified, a new link has been sent' };
  }

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifyToken: token },
  });

  // TODO: send verification email once SMTP is implemented
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[DEV] Email verification token for ${email}: ${token}`);
  }

  return { message: 'If that email exists and is unverified, a new link has been sent' };
}
