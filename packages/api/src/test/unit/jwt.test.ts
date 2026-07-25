import { describe, it, expect, vi } from 'vitest';
import jsonwebtoken from 'jsonwebtoken';

const envState = vi.hoisted(() => ({
  JWT_SECRET: 'test-access-secret-0123456789abcdef',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef',
}));

vi.mock('../../config/env.js', () => ({ env: envState }));

import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../utils/jwt.js';

const PAYLOAD = { id: 'user-1', email: 'u@example.com', name: 'User' };

describe('refresh token uniqueness', () => {
  it('mints distinct tokens for identical payloads in the same second', () => {
    // Regression: without a jti, same-second logins produced byte-identical
    // JWTs, which collide on the refresh_tokens.token UNIQUE index — i.e. a
    // second device signing in within the same second got a 409.
    const a = generateRefreshToken(PAYLOAD);
    const b = generateRefreshToken(PAYLOAD);
    expect(a).not.toBe(b);
    expect(verifyRefreshToken(a)?.id).toBe('user-1');
    expect(verifyRefreshToken(b)?.id).toBe('user-1');
  });
});

describe('algorithm pinning', () => {
  it('rejects tokens signed with a different algorithm, even with the right secret', () => {
    const hs512 = jsonwebtoken.sign(PAYLOAD, envState.JWT_SECRET, {
      algorithm: 'HS512',
      expiresIn: '15m',
    });
    expect(verifyAccessToken(hs512)).toBeNull();
  });

  it('rejects access tokens signed with the refresh secret and vice versa', () => {
    const access = generateAccessToken(PAYLOAD);
    const refresh = generateRefreshToken(PAYLOAD);
    expect(verifyRefreshToken(access)).toBeNull();
    expect(verifyAccessToken(refresh)).toBeNull();
  });

  it('round-trips valid tokens', () => {
    expect(verifyAccessToken(generateAccessToken(PAYLOAD))?.email).toBe('u@example.com');
  });
});
