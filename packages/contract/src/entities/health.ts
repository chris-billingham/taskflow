import { z } from 'zod';

/**
 * GET /health. Everyone gets the verdict; only loopback callers (the
 * container healthcheck, an operator inside the container) also get the
 * version and per-dependency checks.
 */
export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  timestamp: z.string(),
  version: z.string().optional(),
  checks: z.record(z.string(), z.enum(['ok', 'error'])).optional(),
});
