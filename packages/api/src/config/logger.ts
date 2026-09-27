import { pino } from 'pino';
import { env } from './env.js';
import { getRequestId } from '../utils/requestContext.js';

/**
 * The one logger for the API and the worker. Fastify is handed this instance,
 * so request logs, service logs and job logs share a format and level, and
 * anything logged while a request is being handled carries its reqId, which
 * ties a failed side effect back to the request that caused it.
 */
const quiet = env.NODE_ENV === 'test' || process.env.VITEST !== undefined;

export const logger = pino({
  // Tests stay quiet (some mock env entirely, so fall back to info).
  level: quiet ? 'silent' : (env.LOG_LEVEL ?? 'info'),
  mixin(_obj, _level, instance) {
    // Fastify's per-request child loggers already bind reqId.
    const reqId = getRequestId();
    return reqId && !('reqId' in instance.bindings()) ? { reqId } : {};
  },
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname', colorize: true },
        }
      : undefined,
});

/** A `.catch()` handler that logs a failed fire-and-forget side effect. */
export function logFailure(msg: string, fields: Record<string, unknown> = {}) {
  return (err: unknown) => logger.error({ err, ...fields }, msg);
}
