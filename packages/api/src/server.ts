import { env, shouldRunWorkersInApi } from './config/env.js';
import { buildApp } from './app.js';
import { closeRedis } from './config/redis.js';
import { initializeWorkers } from './worker.js';
import { createWebSocketServer } from './websocket/server.js';
import { stopPresenceCleanup } from './websocket/presence.js';
import { ensureBucketExists } from './config/storage.js';
import { initMailer } from './services/mailService.js';
import { syncAdminsFromEnv } from './services/adminService.js';
import { ensureDefaultTemplates } from './services/templateService.js';
import { prisma } from './config/database.js';

const server = await buildApp();

// Workers state
let workersShutdown: (() => Promise<void>) | null = null;
let io: ReturnType<typeof createWebSocketServer> | null = null;

// Graceful shutdown — with a hard deadline so a hung dependency can't stall
// past Docker's stop grace period into a SIGKILL mid-write.
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.log.info('Shutting down...');

  const forceExit = setTimeout(() => {
    server.log.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    stopPresenceCleanup();
    if (io) await new Promise<void>((resolve) => io!.close(() => resolve()));
    if (workersShutdown) await workersShutdown();
    await server.close();
    await prisma.$disconnect();
    await closeRedis();
    process.exit(0);
  } catch (err) {
    server.log.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// A rejected promise nobody awaited must be visible, not silent; a truly
// uncaught exception leaves undefined state — log and restart (Docker's
// restart policy brings the process back).
process.on('unhandledRejection', (reason) => {
  server.log.error({ err: reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  server.log.fatal({ err }, 'Uncaught exception — exiting');
  process.exit(1);
});

// Start server
const start = async () => {
  try {
    // Verify SMTP before accepting requests: whether registration requires
    // email verification depends on the mailer being provably reachable.
    await initMailer(server.log);

    // Promote any ADMIN_EMAILS accounts that predate the config. Never fatal:
    // a database hiccup here must not stop the API from serving.
    try {
      await syncAdminsFromEnv(env.ADMIN_EMAILS, {
        info: (msg) => server.log.info(msg),
        warn: (msg) => server.log.warn(msg),
      });
    } catch (adminErr) {
      server.log.error({ err: adminErr }, 'Failed to sync ADMIN_EMAILS');
    }

    // Built-in templates ship with the app but were only ever installed by
    // `pnpm db:seed`, which no production install runs — so the gallery was
    // empty everywhere. Idempotent, and non-fatal for the same reason.
    try {
      await ensureDefaultTemplates({ info: (msg) => server.log.info(msg) });
    } catch (templateErr) {
      server.log.error({ err: templateErr }, 'Failed to install default templates');
    }

    await server.listen({ port: env.API_PORT, host: env.HOST });
    server.log.info(
      `Taskflow API server listening on http://${env.HOST}:${env.API_PORT}`,
    );

    io = createWebSocketServer(server.server);
    server.log.info('WebSocket server initialized');

    // Initialize the S3 storage bucket (Garage creates it itself; external S3 may not)
    try {
      await ensureBucketExists();
      server.log.info('Storage bucket ready');
    } catch (storageErr) {
      server.log.warn({ err: storageErr }, 'Storage unavailable — file uploads will not work');
    }

    // Initialize background workers (non-blocking). Skipped when a dedicated
    // worker container owns them — see shouldRunWorkersInApi().
    if (shouldRunWorkersInApi()) {
      try {
        const workers = await initializeWorkers();
        workersShutdown = workers.shutdown;
        server.log.info('Background workers initialized (in-process)');
      } catch (workerErr) {
        server.log.warn({ err: workerErr }, 'Failed to initialize workers (Redis may be unavailable)');
      }
    } else {
      server.log.info(
        'Background workers not started in the API process — the worker service owns them. Set RUN_WORKERS_IN_API=true if you deploy without one.',
      );
    }
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
