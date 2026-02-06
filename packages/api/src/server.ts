import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import { env } from './config/env.js';
import { registerRoutes } from './routes/index.js';
import { closeRedis } from './config/redis.js';

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
server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// API info route
server.get('/', async () => {
  return {
    name: 'Taskflow API',
    version: '1.0.0',
    status: 'running',
  };
});

// Graceful shutdown
async function shutdown() {
  server.log.info('Shutting down...');
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
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
