import { env } from './config/env.js';
import { initializeWorkers } from './worker.js';
import { closeRedis } from './config/redis.js';

console.log(`[Worker] Starting in ${env.NODE_ENV} mode`);

let workersShutdown: (() => Promise<void>) | null = null;

async function shutdown() {
  console.log('[Worker] Shutting down...');
  if (workersShutdown) await workersShutdown();
  await closeRedis();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function start() {
  try {
    const workers = await initializeWorkers();
    workersShutdown = workers.shutdown;
    console.log('[Worker] All workers running. Waiting for jobs...');
  } catch (err) {
    console.error('[Worker] Failed to start:', err);
    process.exit(1);
  }
}

start();
