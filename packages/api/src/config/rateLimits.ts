import { env } from './env.js';

/**
 * A route's request budget. Production uses the given limit scaled by
 * RATE_LIMIT_MULTIPLIER; development and tests get a flat, generous budget so
 * local work and test suites never trip it.
 */
export function rateLimitMax(productionMax: number, nonProductionMax = 1000): number {
  if (env.NODE_ENV !== 'production') return nonProductionMax;
  return Math.ceil(productionMax * env.RATE_LIMIT_MULTIPLIER);
}
