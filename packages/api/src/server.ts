import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from './config/env.js';
import { registerRoutes } from './routes/index.js';
import { runWithRequestContext } from './utils/requestContext.js';
import { closeRedis, getRedis } from './config/redis.js';
import { initializeWorkers } from './worker.js';
import { createWebSocketServer } from './websocket/server.js';
import { stopPresenceCleanup } from './websocket/presence.js';
import { ensureBucketExists } from './config/storage.js';
import { initMailer } from './services/mailService.js';
import { syncAdminsFromEnv } from './services/adminService.js';
import { prisma } from './config/database.js';
import { Prisma } from '@prisma/client';
import { openapiSpec } from './docs/openapi.js';

const server = Fastify({
  // Exactly one proxy hop (Traefik / nginx / Vite) sits in front of the API.
  // Without this, request.ip is the proxy container's address, which made
  // every rate limit ONE SHARED GLOBAL BUCKET: five failed logins by anyone
  // locked out login for the whole deployment.
  trustProxy: true,
  bodyLimit: 1_048_576, // 1MB JSON body limit
  logger: {
    level: env.LOG_LEVEL,
    transport:
      env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
              colorize: true,
            },
          }
        : undefined,
  },
});

// Register plugins
await server.register(cors, {
  origin: env.CORS_ORIGIN,
  credentials: true,
});

await server.register(helmet, {
  // CSP not needed for a pure JSON API, but enable all other protections
  contentSecurityPolicy: false,
});

await server.register(cookie);

// Global rate limiting, backed by Redis so limits survive restarts and are
// shared across replicas. Generous default for normal app traffic; expensive
// or sensitive routes carry stricter per-route budgets via config.rateLimit.
await server.register(rateLimit, {
  global: true,
  max: env.NODE_ENV === 'production' ? 300 : 5000,
  timeWindow: '1 minute',
  redis: getRedis(),
  nameSpace: 'rl:',
});

await server.register(websocket);
await server.register(multipart, {
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 },
});

// API docs are an endpoint inventory — served only when explicitly enabled
// (or in development), not to every anonymous visitor of a production host.
if (env.NODE_ENV === 'development' || env.ENABLE_API_DOCS) {
  await server.register(swagger, {
    mode: 'static',
    specification: { document: openapiSpec as never },
  });

  await server.register(swaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
    staticCSP: true,
  });
}

// Global error handler - must be set before routes
server.setErrorHandler((error, request, reply) => {
  const err = error as Error & { statusCode?: number; code?: string; validation?: unknown };

  // Custom AppError or any error with statusCode
  if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    return reply.status(err.statusCode).send({
      success: false,
      error: err.code ?? 'ERROR',
      message: err.message,
    });
  }

  // Fastify validation errors
  if (err.validation) {
    return reply.status(400).send({
      success: false,
      error: 'VALIDATION_ERROR',
      message: err.message,
    });
  }

  // Map common Prisma errors to sensible HTTP codes instead of a blanket 500.
  // These are reachable via normal races/bad input (e.g. a row deleted between
  // an access check and an update, a duplicate, or a bad foreign key).
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      return reply.status(404).send({
        success: false,
        error: 'NOT_FOUND',
        message: 'The requested resource was not found',
      });
    }
    if (error.code === 'P2002') {
      return reply.status(409).send({
        success: false,
        error: 'CONFLICT',
        message: 'A record with those values already exists',
      });
    }
    if (error.code === 'P2003') {
      return reply.status(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'A referenced record does not exist',
      });
    }
  }

  request.log.error(error);
  return reply.status(500).send({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message:
      env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
  });
});

// Bind every request to an AsyncLocalStorage context so service-layer code
// can access the request ID for log correlation without threading it through params.
server.addHook('onRequest', (request, _reply, done) => {
  runWithRequestContext({ requestId: request.id }, done);
});

// Register routes
await server.register(registerRoutes);

// Health check route
async function healthCheck() {
  const checks: Record<string, 'ok' | 'error'> = {};
  let healthy = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
    healthy = false;
  }

  try {
    await getRedis().ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'error';
    healthy = false;
  }

  return { healthy, checks };
}

server.get('/health', async (_request, reply) => {
  const { healthy, checks } = await healthCheck();
  return reply.status(healthy ? 200 : 503).send({
    status: healthy ? 'ok' : 'degraded',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks,
  });
});

server.get('/api/health', async (_request, reply) => {
  const { healthy, checks } = await healthCheck();
  return reply.status(healthy ? 200 : 503).send({
    status: healthy ? 'ok' : 'degraded',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks,
  });
});

// API info route
server.get('/', async () => {
  return {
    name: 'Taskflow API',
    version: '1.0.0',
    status: 'running',
  };
});

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

    await server.listen({ port: env.API_PORT, host: env.HOST });
    server.log.info(
      `Taskflow API server listening on http://${env.HOST}:${env.API_PORT}`,
    );

    io = createWebSocketServer(server.server);
    server.log.info('WebSocket server initialized');

    // Initialize S3/MinIO storage bucket
    try {
      await ensureBucketExists();
      server.log.info('Storage bucket ready');
    } catch (storageErr) {
      server.log.warn({ err: storageErr }, 'Storage unavailable — file uploads will not work');
    }

    // Initialize background workers (non-blocking)
    try {
      const workers = await initializeWorkers();
      workersShutdown = workers.shutdown;
      server.log.info('Background workers initialized');
    } catch (workerErr) {
      server.log.warn({ err: workerErr }, 'Failed to initialize workers (Redis may be unavailable)');
    }
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
