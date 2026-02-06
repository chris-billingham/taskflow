import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';

const PORT = process.env.API_PORT ? parseInt(process.env.API_PORT) : 3001;
const HOST = process.env.HOST || '0.0.0.0';

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport:
      process.env.NODE_ENV === 'development'
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
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
});

await server.register(jwt, {
  secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  cookie: {
    cookieName: 'token',
    signed: false,
  },
});

await server.register(cookie);
await server.register(websocket);

// Health check route
server.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// API info route
server.get('/', async (request, reply) => {
  return {
    name: 'Taskflow API',
    version: '1.0.0',
    status: 'running',
  };
});

// Start server
const start = async () => {
  try {
    await server.listen({ port: PORT, host: HOST });
    console.log(`\n🚀 Taskflow API server listening on http://${HOST}:${PORT}\n`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
