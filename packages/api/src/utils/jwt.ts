import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface TokenPayload {
  id: string;
  email: string;
  name: string;
  /** The session (signed-in device) the token belongs to. */
  sid?: string;
}

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '30d';

const JWT_ALGORITHM = 'HS256' as const;

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    algorithm: JWT_ALGORITHM,
  });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
    algorithm: JWT_ALGORITHM,
    // Refresh tokens are persisted under a UNIQUE index. Without a random jti,
    // two logins for the same user in the same second mint byte-identical
    // JWTs (same payload, same second-granularity iat) and the second insert
    // fails — i.e. multi-device/multi-tab sign-in collides.
    jwtid: crypto.randomUUID(),
  });
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as TokenPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as TokenPayload;
  } catch {
    return null;
  }
}

// Signed with a key of its own, so a sign-in challenge can never pass as an
// access token (or the reverse).
const challengeKey = () => `${env.JWT_SECRET}:two-factor-challenge`;
const CHALLENGE_EXPIRY = '5m';

/** Proof that someone just entered the right password, pending their second factor. */
export function generateChallengeToken(userId: string): string {
  return jwt.sign({ purpose: 'two-factor' }, challengeKey(), {
    subject: userId,
    expiresIn: CHALLENGE_EXPIRY,
    algorithm: JWT_ALGORITHM,
  });
}

/** The user id a challenge token was issued for, or null if invalid or expired. */
export function verifyChallengeToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, challengeKey(), { algorithms: [JWT_ALGORITHM] }) as jwt.JwtPayload;
    return payload.purpose === 'two-factor' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}
