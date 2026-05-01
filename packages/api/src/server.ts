import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from './config/env.js';
import { registerRoutes } from './routes/index.js';
import { closeRedis, getRedis } from './config/redis.js';
import { initializeWorkers } from './worker.js';
import { createWebSocketServer } from './websocket/server.js';
import { ensureBucketExists } from './config/storage.js';
import { prisma } from './config/database.js';
import { openapiSpec } from './docs/openapi.js';

const server = Fastify({
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

await server.register(cookie);
await server.register(websocket);
await server.register(multipart, {
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 },
});

await server.register(swagger, {
  mode: 'static',
  specification: { document: openapiSpec as never },
});

await server.register(swaggerUi, {
  routePrefix: '/api/docs',
  uiConfig: { docExpansion: 'list', deepLinking: true },
  staticCSP: true,
});

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

// Graceful shutdown
async function shutdown() {
  server.log.info('Shutting down...');
  if (workersShutdown) await workersShutdown();
  await server.close();
  await closeRedis();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
const start = async () => {
  try {
    await server.listen({ port: env.API_PORT, host: env.HOST });
    server.log.info(
      `Taskflow API server listening on http://${env.HOST}:${env.API_PORT}`,
    );

    createWebSocketServer(server.server);
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
