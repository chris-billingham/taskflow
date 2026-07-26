import { env } from './config/env.js';
import { initializeWorkers } from './worker.js';
import { closeRedis } from './config/redis.js';
import { prisma } from './config/database.js';
import { initMailer } from './services/mailService.js';

console.log(`[Worker] Starting in ${env.NODE_ENV} mode`);

let workersShutdown: (() => Promise<void>) | null = null;

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[Worker] Shutting down...');

  const forceExit = setTimeout(() => {
    console.error('[Worker] Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    if (workersShutdown) await workersShutdown();
    await prisma.$disconnect();
    await closeRedis();
    process.exit(0);
  } catch (err) {
    console.error('[Worker] Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (reason) => {
  console.error('[Worker] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Worker] Uncaught exception — exiting:', err);
  process.exit(1);
});

async function start() {
  try {
    // The mailer is module state, per PROCESS. initMailer was only ever called
    // by server.ts, so isMailerReady() was permanently false in here — and
    // every email the app sends from a background job (reminder emails, the
    // daily/weekly digest, due-soon and overdue notices) is produced ONLY by
    // this process. They were all silently dropped in production, where jobs
    // run in the worker container; locally they appeared to work because the
    // API process runs the same workers in-process and had initialised its own.
    await initMailer({
      info: (msg) => console.log(`[Worker] ${msg}`),
      error: (msg) => console.error(`[Worker] ${msg}`),
    });

    const workers = await initializeWorkers();
    workersShutdown = workers.shutdown;
    console.log('[Worker] All workers running. Waiting for jobs...');
  } catch (err) {
    console.error('[Worker] Failed to start:', err);
    process.exit(1);
  }
}

start();
