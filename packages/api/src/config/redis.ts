import { Redis } from 'ioredis';
import { env } from './env.js';

let redis: Redis | null = null;

/**
 * Reconnect for as long as the process lives, with capped backoff.
 *
 * Returning null from retryStrategy tells ioredis to STOP RECONNECTING and
 * close the connection permanently. Giving up after three ~200ms attempts
 * meant a Redis restart of more than about a second (a container restart, an
 * upgrade, an OOM kill) permanently broke the process it was serving: the API
 * served 503s from /health and lost rate limiting and password-reset tokens,
 * and the worker silently stopped running reminders and digests — in both
 * cases until a human restarted the container, since a failing Docker
 * healthcheck does not restart anything on its own.
 */
function retryStrategy(times: number): number {
  return Math.min(times * 200, 5000);
}

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy,
    });

    redis.on('error', (err: Error) => {
      console.error('Redis connection error:', err.message);
    });
  }
  return redis;
}

/**
 * Create a new Redis connection compatible with BullMQ.
 * BullMQ requires maxRetriesPerRequest to be null.
 * Each call returns a fresh connection (BullMQ manages its own pool).
 */
export function createBullMQConnection(): Redis {
  const conn = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy,
  });

  conn.on('error', (err: Error) => {
    console.error('BullMQ Redis connection error:', err.message);
  });

  return conn;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
