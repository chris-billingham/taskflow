import { Redis } from 'ioredis';
import { env } from './env.js';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
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
    retryStrategy(times: number) {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
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
