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
  const emailVerifyToken = crypto.randomBytes(32).toString('hex');

  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      name: data.name,
      emailVerifyToken,
    },
  });

  // Create a personal workspace and inbox project for the new user
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Personal',
      slug: `personal-${user.id}`,
      ownerId: user.id,
      members: {
        create: { userId: user.id, role: 'OWNER' },
      },
    },
  });

  await prisma.project.create({
    data: {
      name: 'Inbox',
      ownerId: user.id,
      workspaceId: workspace.id,
      isInbox: true,
    },
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

  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  });
  if (!stored || stored.expiresAt < new Date()) {
    // If token was already used/deleted, invalidate all tokens for this user (rotation detection)
    if (payload.id) {
      await prisma.refreshToken.deleteMany({
        where: { userId: payload.id },
      });
    }
    throw new UnauthorizedError('Refresh token expired or already used');
  }

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  // Delete the old refresh token (rotation)
  await prisma.refreshToken.delete({ where: { id: stored.id } });

  return createTokenPair(user);
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

  // In production, send email here. For now, return the token.
  return { resetToken, message: 'If that email exists, a reset link has been sent' };
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
