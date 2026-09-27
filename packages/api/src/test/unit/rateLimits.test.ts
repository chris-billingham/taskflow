import { describe, it, expect, vi, beforeEach } from 'vitest';

const env = vi.hoisted(() => ({ NODE_ENV: 'production', RATE_LIMIT_MULTIPLIER: 1 }));
vi.mock('../../config/env.js', () => ({ env }));

import { rateLimitMax } from '../../config/rateLimits.js';

beforeEach(() => {
  env.NODE_ENV = 'production';
  env.RATE_LIMIT_MULTIPLIER = 1;
});

describe('rateLimitMax', () => {
  it('uses the shipped production limit by default', () => {
    expect(rateLimitMax(5)).toBe(5);
  });

  it('scales production limits by RATE_LIMIT_MULTIPLIER, rounding up', () => {
    env.RATE_LIMIT_MULTIPLIER = 2.5;
    expect(rateLimitMax(5)).toBe(13);
    expect(rateLimitMax(300, 5000)).toBe(750);
  });

  it('gives development and tests the flat non-production budget', () => {
    env.NODE_ENV = 'development';
    env.RATE_LIMIT_MULTIPLIER = 50;
    expect(rateLimitMax(5)).toBe(1000);
    expect(rateLimitMax(300, 5000)).toBe(5000);
  });
});
