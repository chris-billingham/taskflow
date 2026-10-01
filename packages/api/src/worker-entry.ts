import { env } from './config/env.js';
import { initializeWorkers } from './worker.js';
import { initSocketEmitter } from './websocket/events.js';
import { closeRedis } from './config/redis.js';
import { prisma } from './config/database.js';
import { initMailer } from './services/mailService.js';
import { logger as rootLogger } from './config/logger.js';

const logger = rootLogger.child({ process: 'worker' });

logger.info(`Starting in ${env.NODE_ENV} mode`);

let workersShutdown: (() => Promise<void>) | null = null;

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down...');

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    if (workersShutdown) await workersShutdown();
    await prisma.$disconnect();
    await closeRedis();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — exiting');
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
    await initMailer(logger);
    // Jobs create notifications; this sends them live to open browsers.
    initSocketEmitter();

    const workers = await initializeWorkers();
    workersShutdown = workers.shutdown;
    logger.info('All workers running. Waiting for jobs...');
  } catch (err) {
    logger.fatal({ err }, 'Failed to start');
    process.exit(1);
  }
}

start();
