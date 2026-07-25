import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface TokenPayload {
  id: string;
  email: string;
  name: string;
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
