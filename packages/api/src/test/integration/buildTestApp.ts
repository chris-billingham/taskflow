import { buildApp } from '../../app.js';

/**
 * The real app — every plugin, the global error handler and all routes — with
 * test-friendly options: no logging, in-memory rate limits, no Swagger UI.
 * Suites mock the services they exercise; nothing here touches a database.
 */
export function buildTestApp() {
  return buildApp({ logger: false, rateLimitRedis: false, docs: false });
}
