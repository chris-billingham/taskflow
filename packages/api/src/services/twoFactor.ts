import { createHash, randomInt } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';
import { prisma } from '../config/database.js';
import { publicAppUrl } from '../config/env.js';
import { getRedis } from '../config/redis.js';
import { ConflictError, ValidationError, AppError } from '../errors/index.js';

/**
 * Two-factor sign-in with an authenticator app (TOTP, RFC 6238: six digits,
 * 30-second steps) and one-time recovery codes for when the phone isn't at
 * hand.
 */

const PERIOD = 30;
const RECOVERY_CODE_COUNT = 10;
// Lowercase letters and digits without the look-alikes (0/o, 1/l/i).
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
/** Wrong second-factor codes allowed per account in this many seconds. */
const MAX_FAILURES = 10;
const FAILURE_WINDOW_S = 15 * 60;

const issuer = () => {
  try {
    return `Taskflow (${new URL(publicAppUrl()).host})`;
  } catch {
    return 'Taskflow';
  }
};

function totpFor(secret: string, label: string) {
  return new TOTP({ issuer: issuer(), label, algorithm: 'SHA1', digits: 6, period: PERIOD, secret: Secret.fromBase32(secret) });
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const normaliseRecoveryCode = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, '');

function newRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const chars = Array.from({ length: 10 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

async function replaceRecoveryCodes(userId: string, db: Pick<typeof prisma, 'recoveryCode'> = prisma) {
  const codes = newRecoveryCodes();
  await db.recoveryCode.deleteMany({ where: { userId } });
  await db.recoveryCode.createMany({
    data: codes.map((code) => ({ userId, codeHash: sha256(normaliseRecoveryCode(code)) })),
  });
  return codes;
}

/**
 * The time step a code is valid for (allowing one step of clock drift either
 * way), or null. A step at or before the last one accepted is refused, so a
 * code that has been seen once can't be replayed.
 */
function acceptedStep(secret: string, label: string, lastStep: number | null, code: string, now = Date.now()): number | null {
  const token = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(token)) return null;
  const delta = totpFor(secret, label).validate({ token, timestamp: now, window: 1 });
  if (delta === null) return null;
  const step = Math.floor(now / 1000 / PERIOD) + delta;
  return lastStep !== null && step <= lastStep ? null : step;
}

export async function getStatus(userId: string) {
  const [user, left] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { twoFactorEnabledAt: true } }),
    prisma.recoveryCode.count({ where: { userId, usedAt: null } }),
  ]);
  return { enabled: !!user.twoFactorEnabledAt, enabledAt: user.twoFactorEnabledAt, recoveryCodesLeft: user.twoFactorEnabledAt ? left : 0 };
}

/** Start setting up: a new secret, as text and as a QR code for the authenticator app. */
export async function beginSetup(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, twoFactorEnabledAt: true } });
  if (user.twoFactorEnabledAt) throw new ConflictError('Two-factor sign-in is already on.');
  const secret = new Secret({ size: 20 }).base32;
  await prisma.user.update({ where: { id: userId }, data: { totpSecret: secret, totpLastStep: null } });
  const otpauthUrl = totpFor(secret, user.email).toString();
  const svg = await QRCode.toString(otpauthUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return { secret, otpauthUrl, qrCode: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` };
}

/** Finish setting up with a code from the app; returns the recovery codes, shown once. */
export async function enable(userId: string, code: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.twoFactorEnabledAt) throw new ConflictError('Two-factor sign-in is already on.');
  if (!user.totpSecret) throw new ValidationError('Start setting up two-factor sign-in first.');
  const step = acceptedStep(user.totpSecret, user.email, user.totpLastStep, code);
  if (step === null) {
    throw new ValidationError("That code isn't right. Check your phone's clock is set automatically, and enter the newest code.");
  }
  return prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { twoFactorEnabledAt: new Date(), totpLastStep: step } });
    return { recoveryCodes: await replaceRecoveryCodes(userId, tx) };
  });
}

/** New recovery codes; the old ones stop working. */
export async function regenerateRecoveryCodes(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { twoFactorEnabledAt: true } });
  if (!user.twoFactorEnabledAt) throw new ValidationError('Two-factor sign-in is off.');
  return { recoveryCodes: await replaceRecoveryCodes(userId) };
}

/** Turn two-factor sign-in off and forget the secret and recovery codes. */
export async function disable(userId: string) {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { totpSecret: null, twoFactorEnabledAt: null, totpLastStep: null } }),
    prisma.recoveryCode.deleteMany({ where: { userId } }),
  ]);
}

export class TooManyAttemptsError extends AppError {
  constructor() {
    super('Too many wrong codes. Wait 15 minutes and try again.', 429, 'TOO_MANY_ATTEMPTS');
  }
}

/**
 * Check a second factor: a code from the app, or an unused recovery code
 * (which is then spent). Wrong codes count against the account, so someone
 * with the password can't keep guessing from fresh addresses.
 */
export async function verifySecondFactor(userId: string, input: { code?: string; recoveryCode?: string }): Promise<boolean> {
  const failures = `two-factor:failures:${userId}`;
  const redis = getRedis();
  if (Number(await redis.get(failures)) >= MAX_FAILURES) throw new TooManyAttemptsError();

  let ok = false;
  if (input.code) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.twoFactorEnabledAt && user.totpSecret) {
      const step = acceptedStep(user.totpSecret, user.email, user.totpLastStep, input.code);
      if (step !== null) {
        // Conditional, so two simultaneous sign-ins can't both spend one code.
        const { count } = await prisma.user.updateMany({
          where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
          data: { totpLastStep: step },
        });
        ok = count === 1;
      }
    }
  } else if (input.recoveryCode) {
    const { count } = await prisma.recoveryCode.updateMany({
      where: { userId, codeHash: sha256(normaliseRecoveryCode(input.recoveryCode)), usedAt: null },
      data: { usedAt: new Date() },
    });
    ok = count === 1;
  }

  if (ok) {
    await redis.del(failures);
  } else {
    await redis.multi().incr(failures).expire(failures, FAILURE_WINDOW_S).exec();
  }
  return ok;
}

/** For tests: the code an authenticator app would show for this secret now. */
export function currentCode(secret: string, label: string, now = Date.now()) {
  return totpFor(secret, label).generate({ timestamp: now });
}
