import crypto from 'node:crypto';
import { prisma } from '../config/database.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import {
  generateAccessToken,
  generateChallengeToken,
  verifyChallengeToken,
  generateRefreshToken,
  verifyRefreshToken,
  type TokenPayload,
} from '../utils/jwt.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../errors/index.js';
import type { RegisterInput } from '@taskflow/contract';
import type { SystemRole } from '@prisma/client';
import { disconnectSessionSockets, disconnectUserSockets } from '../websocket/events.js';
import { isBootstrapAdminEmail } from '../config/env.js';
import { canRegister } from './instanceSettingsService.js';
import { provisionUser } from './userService.js';
import {
  isMailerReady,
  sendVerificationEmail,
  sendPasswordResetEmail,
} from './mailService.js';
import { logger } from '../config/logger.js';
import { deviceNameFromUserAgent } from '../utils/deviceName.js';
import * as twoFactor from './twoFactor.js';

const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Email delivery must never fail the request that triggered it — the user can
// always use "resend"/"forgot password" if a send is dropped.
function sendInBackground(label: string, fn: () => Promise<void>) {
  void fn().catch((err) => {
    logger.error({ err }, `${label} email failed`);
  });
}

function tokenPayload(user: { id: string; email: string; name: string }, sid: string): TokenPayload {
  return { id: user.id, email: user.email, name: user.name, sid };
}

/** The device a sign-in comes from. */
export interface DeviceInfo {
  client: 'web' | 'app';
  /** Given by apps; web sessions are named from the user agent. */
  deviceName?: string;
  userAgent?: string;
}

const SESSION_DAYS = 30;

/**
 * The user object returned alongside a new token pair. `role` is included so
 * the web app can show the admin console immediately after sign-in instead of
 * waiting for the next /users/me. It is display state only — every admin
 * endpoint re-checks the role server-side.
 */
function publicUser(user: {
  id: string;
  email: string;
  name: string;
  role?: SystemRole;
  isActive?: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role ?? 'USER',
    isActive: user.isActive ?? true,
  };
}

/**
 * A new access/refresh pair. Without `session` it starts a new session (a
 * sign-in); with it, it continues that session (a refresh), keeping its id,
 * name and start time.
 */
async function createTokenPair(
  user: { id: string; email: string; name: string },
  device: DeviceInfo,
  session?: { sessionId: string; name: string | null; sessionStartedAt: Date },
) {
  const sessionId = session?.sessionId ?? crypto.randomUUID();
  const payload = tokenPayload(user, sessionId);
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      // Only the hash is stored: a leaked backup or DB read must not yield
      // directly replayable 30-day credentials.
      token: sha256(refreshToken),
      userId: user.id,
      sessionId,
      name: session?.name ?? device.deviceName ?? deviceNameFromUserAgent(device.userAgent),
      client: device.client === 'app' ? 'APP' : 'WEB',
      deviceInfo: device.userAgent?.slice(0, 500),
      sessionStartedAt: session?.sessionStartedAt ?? new Date(),
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken, refreshToken };
}

export async function register(
  data: Omit<RegisterInput, 'client'> & Partial<Pick<RegisterInput, 'client'>>,
  device: DeviceInfo = { client: data.client ?? 'web', deviceName: data.deviceName },
) {
  // Checked before the duplicate-email lookup, so a closed instance doesn't
  // tell strangers which addresses already have accounts.
  if (!(await canRegister(data.email))) {
    throw new ForbiddenError(
      'This Taskflow is invite-only. Ask an administrator for an account, or sign up with the address your invitation was sent to.',
      'REGISTRATION_CLOSED',
    );
  }

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
  const user = await prisma.$transaction((tx) =>
    provisionUser(tx, {
      email: data.email,
      passwordHash,
      name: data.name,
      // Only the hash is stored; the raw token exists solely in the email.
      emailVerifyToken: rawVerifyToken ? sha256(rawVerifyToken) : null,
      emailVerifyTokenExpiresAt: rawVerifyToken
        ? new Date(Date.now() + VERIFY_TOKEN_TTL_MS)
        : null,
      emailVerified: !emailConfigured,
      preferences: data.preferences,
      // On a fresh install the operator's own sign-up must land as an admin
      // straight away; waiting for the next restart to be promoted would mean
      // nobody can administer the instance in the meantime.
      role: isBootstrapAdminEmail(data.email) ? 'ADMIN' : undefined,
    }),
  );

  if (rawVerifyToken) {
    sendInBackground('verification email', () =>
      sendVerificationEmail(user.email, user.name, rawVerifyToken),
    );
    // No session until the address is proven: signing the user in here let
    // an unverified account stay signed in indefinitely via refresh.
    return { user: publicUser(user), verificationRequired: true as const };
  }

  const tokens = await createTokenPair(user, device);

  return {
    user: publicUser(user),
    verificationRequired: false as const,
    ...tokens,
  };
}

export async function login(email: string, password: string, device: DeviceInfo = { client: 'web' }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Checked only AFTER the password is proven, so the endpoint never reveals
  // which addresses belong to suspended accounts to an anonymous caller.
  if (!user.isActive) {
    throw new UnauthorizedError(
      'This account has been deactivated. Contact your administrator.',
    );
  }

  if (!user.emailVerified) {
    throw new UnauthorizedError(
      'Please verify your email address before signing in',
      'EMAIL_NOT_VERIFIED',
    );
  }

  // The password was right; the second factor comes next.
  if (user.twoFactorEnabledAt) {
    return { twoFactorRequired: true as const, challengeToken: generateChallengeToken(user.id) };
  }

  return signIn(user, device);
}

/** An account that may sign in, or null if it's gone or suspended. */
export async function findActiveUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  return user && user.isActive ? user : null;
}

/** Start a session for a user whose identity has been proven. */
export async function signIn(user: Parameters<typeof publicUser>[0], device: DeviceInfo) {
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const tokens = await createTokenPair(user, device);

  return {
    user: publicUser(user),
    ...tokens,
  };
}

/** Step two for an account with two-factor sign-in: the challenge from step one, plus a code. */
export async function completeTwoFactorLogin(
  challengeToken: string,
  factor: { code?: string; recoveryCode?: string },
  device: DeviceInfo = { client: 'web' },
) {
  const userId = verifyChallengeToken(challengeToken);
  if (!userId) {
    throw new UnauthorizedError('That sign-in took too long. Enter your password again.', 'CHALLENGE_EXPIRED');
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  // Re-checked: the account may have been suspended, or two-factor turned
  // off, in the minutes since the password was entered.
  if (!user || !user.isActive || !user.twoFactorEnabledAt) {
    throw new UnauthorizedError('That sign-in took too long. Enter your password again.', 'CHALLENGE_EXPIRED');
  }
  if (!(await twoFactor.verifySecondFactor(user.id, factor))) {
    throw new UnauthorizedError(
      factor.recoveryCode ? "That recovery code isn't right, or has been used." : "That code isn't right.",
      'INVALID_TWO_FACTOR_CODE',
    );
  }
  return signIn(user, device);
}

export async function logout(refreshToken: string) {
  await prisma.refreshToken.deleteMany({ where: { token: sha256(refreshToken) } });
}

/** Two refreshes this close together are one client racing itself, not theft. */
const REUSE_GRACE_MS = 10_000;

export async function refreshTokens(refreshToken: string, device: DeviceInfo = { client: 'web' }) {
  const payload = verifyRefreshToken(refreshToken);
  if (!payload) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  // Claim the token atomically: of two requests with the same token, only
  // one marks it used. Rotated tokens are kept (usedAt) rather than deleted,
  // so a copy presented later is recognised as reuse, not as unknown.
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const stored = await tx.refreshToken.findUnique({
      where: { token: sha256(refreshToken) },
    });
    // Unknown (signed out, revoked from another device) or expired: refused,
    // without touching anything else.
    if (!stored || stored.expiresAt < now) return { refused: 'expired' as const };
    const claimed = await tx.refreshToken.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count === 0) {
      // Already exchanged. Within a few seconds that's two tabs refreshing
      // at once; later, someone else has a copy of the token, so the whole
      // session (every token it rotated through) ends.
      const recent = stored.usedAt && now.getTime() - stored.usedAt.getTime() < REUSE_GRACE_MS;
      return { refused: recent ? ('concurrent' as const) : ('reused' as const), sessionId: stored.sessionId };
    }

    const user = await tx.user.findUnique({ where: { id: stored.userId } });
    if (!user) return { refused: 'expired' as const };

    // A suspension between issuing and renewing must end the session rather
    // than roll it forward for another 30 days.
    if (!user.isActive) return { refused: 'inactive' as const, userId: user.id };

    // Sessions only belong to verified accounts. Registration no longer issues
    // one before verification; this also ends any issued before that change.
    if (!user.emailVerified) {
      throw new UnauthorizedError(
        'Please verify your email address before signing in',
        'EMAIL_NOT_VERIFIED',
      );
    }

    return { refused: null, user, stored };
  });

  // Revocations happen outside the transaction: an error thrown inside it
  // would roll them back (it did, so reuse never ended anything).
  if (result.refused === 'reused') {
    await prisma.refreshToken.deleteMany({ where: { sessionId: result.sessionId } });
    disconnectSessionSockets(result.sessionId);
    logger.warn({ sessionId: result.sessionId }, 'refresh token reused: session ended');
    throw new UnauthorizedError('Refresh token already used');
  }
  if (result.refused === 'inactive') {
    await prisma.refreshToken.deleteMany({ where: { userId: result.userId } });
    throw new UnauthorizedError('This account has been deactivated');
  }
  if (result.refused) throw new UnauthorizedError('Refresh token expired or already used');

  // The same session carries on, under the same name, on the same kind of client.
  return createTokenPair(
    result.user,
    { ...device, client: result.stored.client === 'APP' ? 'app' : 'web' },
    result.stored,
  );
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
    logger.warn({ email, resetToken }, 'no mailer configured: password reset token (development only)');
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
    data: { passwordHash, passwordSet: true },
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
      logger.warn({ email }, 'verification resend requested but no mailer is configured');
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
