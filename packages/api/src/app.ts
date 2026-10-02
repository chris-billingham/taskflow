import Fastify from 'fastify';
import type { FastifyBaseLogger, FastifyInstance, FastifyServerOptions } from 'fastify';
import type { Redis } from 'ioredis';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from './config/env.js';
import { logger as rootLogger } from './config/logger.js';
import { buildTrustProxy } from './utils/trustProxy.js';
import { registerRoutes } from './routes/index.js';
import { runWithRequestContext } from './utils/requestContext.js';
import { getRedis } from './config/redis.js';
import { prisma } from './config/database.js';
import { Prisma } from '@prisma/client';
import { VersionConflictError } from './errors/index.js';
import { jsonSchemaTransform, jsonSchemaTransformObject, validatorCompiler } from 'fastify-type-provider-zod';
import { createContractSerializer } from './utils/contractSerializer.js';
import { healthSchema } from '@taskflow/contract';
import { rateLimitMax } from './config/rateLimits.js';

export const API_VERSION = '1.0.0';

export interface BuildAppOptions {
  /**
   * Fastify logger config (tests pass `false`). Defaults to the shared
   * application logger, so request and service logs are one stream.
   */
  logger?: FastifyServerOptions['logger'];
  /**
   * Redis client for rate-limit counters, or `false` for the in-memory store
   * (tests). Defaults to the shared client.
   */
  rateLimitRedis?: Redis | false;
  /** Serve Swagger UI at /api/docs. Defaults to development or ENABLE_API_DOCS. */
  docs?: boolean;
}

/**
 * The fully configured HTTP app: plugins, error handling, routes and health.
 * No listening, sockets, workers or process handlers — those belong to
 * server.ts — so tests can build the real app and exercise it with inject().
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const server = Fastify({
    // Number of proxy hops in front of the API, NOT `true`.
    //
    // `trustProxy: true` trusts the entire X-Forwarded-For chain, so request.ip
    // becomes the LEFTMOST entry — which any client can set to whatever it likes.
    // Every rate limit then keys on an attacker-chosen value: rotating the header
    // gave unlimited attempts at the 5-per-15-minutes login limit.
    //
    // A hop count instead trusts only the N addresses nearest the server, so
    // request.ip is the address the outermost TRUSTED proxy actually observed.
    // One hop (Traefik, or nginx/Vite in the other topologies) is the shipped
    // deployment; raise TRUST_PROXY_HOPS if you add another proxy in front, e.g.
    // a CDN — leaving it too low keys limits on the CDN's IP (one shared bucket),
    // setting it too high lets clients spoof again.
    //
    // The count alone is not enough on Fastify >= 5.12.1 (a numeric value there
    // trusts nothing); see utils/trustProxy.ts.
    trustProxy: buildTrustProxy(env.TRUST_PROXY_HOPS, env.TRUST_PROXY_ADDRS),
    bodyLimit: 1_048_576, // 1MB JSON body limit
    ...(options.logger !== undefined ? { logger: options.logger } : { loggerInstance: rootLogger as FastifyBaseLogger }),
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
    max: rateLimitMax(300, 5000),
    timeWindow: '1 minute',
    ...(options.rateLimitRedis === false
      ? {}
      : { redis: options.rateLimitRedis ?? getRedis(), nameSpace: 'rl:' }),
  });

  await server.register(multipart, {
    limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 },
  });

  // Requests are validated, and responses serialized, by each route's Zod
  // schemas from @taskflow/contract.
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(
    createContractSerializer(server.log, env.NODE_ENV !== 'production'),
  );

  // API docs are an endpoint inventory — served only when explicitly enabled
  // (or in development), not to every anonymous visitor of a production host.
  // The OpenAPI document is generated from the same route schemas, so it can't
  // drift from what the API actually accepts and returns.
  if (options.docs ?? (env.NODE_ENV === 'development' || env.ENABLE_API_DOCS)) {
    await server.register(swagger, {
      openapi: {
        info: {
          title: 'Taskflow API',
          description:
            'Self-hosted task management. Authenticate with a Bearer access token from POST /api/v1/auth/login.',
          version: API_VERSION,
        },
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
        security: [{ bearerAuth: [] }],
      },
      // A plugin's root route is registered as `/api/v1/tasks/`; Fastify answers
      // with or without the slash, so document the spelling clients expect.
      transform: (route) => {
        const out = jsonSchemaTransform(route);
        return { ...out, url: route.url.length > 1 ? route.url.replace(/\/$/, '') : route.url };
      },
      // Named contract schemas become shared components (see contract openapiNames.ts).
      transformObject: jsonSchemaTransformObject,
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

    // Schema validation errors: report the first issue's own message
    // ("Invalid email address"), not Fastify's "body/email ..." prefix form.
    if (err.validation) {
      const first = (err.validation as Array<{ message?: string }>)[0];
      return reply.status(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: first?.message ?? err.message,
      });
    }

    // Custom AppError or any error with statusCode
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.status(err.statusCode).send({
        success: false,
        error: err.code ?? 'ERROR',
        message: err.message,
        // A version conflict sends the row as it is now, for the client to merge.
        ...(error instanceof VersionConflictError && { current: error.current }),
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

  /**
   * Health is reachable without authentication — Traefik routes /health publicly
   * so an external uptime monitor can reach it, and the container healthcheck
   * needs it before anyone could hold a token. So the response is tailored to who
   * is asking.
   *
   * Everyone gets the verdict: `status` and the 200/503, which is all a monitor
   * needs (the documented keyword check is on `"status":"ok"`). Only callers on the
   * loopback interface — the container's own healthcheck, and an operator inside
   * the container via `docker compose exec` — additionally get the per-dependency
   * breakdown and the version. Those are an unauthenticated inventory of what this
   * deployment runs and which part of it is currently broken: the exact release to
   * look up advisories for, and confirmation of when to try.
   *
   * request.ip is proxy-aware (see TRUST_PROXY_HOPS), so a request forwarded by
   * Traefik carries the real client address and never passes as loopback.
   */
  function isLoopback(ip: string): boolean {
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  }

  async function healthResponse(request: { ip: string }) {
    const { healthy, checks } = await healthCheck();
    return {
      statusCode: healthy ? (200 as const) : (503 as const),
      body: {
        status: healthy ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        ...(isLoopback(request.ip) ? { version: API_VERSION, checks } : {}),
      },
    };
  }

  const healthRoute = {
    schema: {
      tags: ['Health'],
      summary: 'Liveness and dependency health (public)',
      security: [],
      response: { 200: healthSchema, 503: healthSchema },
    },
  };

  server.get('/health', healthRoute, async (request, reply) => {
    const { statusCode, body } = await healthResponse(request);
    return reply.status(statusCode).send(body);
  });

  server.get('/api/health', healthRoute, async (request, reply) => {
    const { statusCode, body } = await healthResponse(request);
    return reply.status(statusCode).send(body);
  });

  // API info route
  server.get('/', async () => {
    return {
      name: 'Taskflow API',
      version: API_VERSION,
      status: 'running',
    };
  });

  return server;
}
