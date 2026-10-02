// Writes the API's OpenAPI document to openapi.json at the repo root. The
// document is generated from the route schemas, so it's committed and CI
// checks it's current (and that changes don't break existing clients).
// Run: pnpm --filter @taskflow/api openapi:export
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Building the app validates its configuration, but nothing here connects to
// the database or signs tokens, so placeholders do when none are set.
process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost:5432/openapi';
process.env.JWT_SECRET ??= 'openapi-export-placeholder-secret-0000000000';
process.env.JWT_REFRESH_SECRET ??= 'openapi-export-placeholder-refresh-00000000';
const { buildApp } = await import('../src/app.js');

const app = await buildApp({ logger: false, rateLimitRedis: false, docs: true });
await app.ready();
const spec = app.swagger() as Record<string, unknown>;
await app.close();

const out = fileURLToPath(new URL('../../../openapi.json', import.meta.url));
writeFileSync(out, JSON.stringify(spec, null, 2) + '\n');
console.log(`Wrote ${out}`);
process.exit(0);
