import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A setting read by the API but not passed through docker-compose.yml does
// nothing on a real install, however it's set in .env. That shipped more
// than once (SMTP, ADMIN_EMAILS, then APNS_*), so every setting env.ts reads
// must reach a container, or be listed here as development only.
const DEV_ONLY = new Set([
  'API_PORT', // Traefik and the healthcheck expect 3001
  'HOST',
  'RUN_WORKERS_IN_API', // the worker container runs the jobs
  'NOTIFICATION_DELIVERY', // tests send inline; production queues
  'APNS_HOST', // tests point it at a fake server
]);

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const envSource = readFileSync(`${root}packages/api/src/config/env.ts`, 'utf8');
const compose = readFileSync(`${root}docker-compose.yml`, 'utf8');

const schema = envSource.slice(envSource.indexOf('const envSchema'), envSource.indexOf('\n});', envSource.indexOf('const envSchema')));
const settings = [...schema.matchAll(/^ {2}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]);

/** The `environment:` keys of one service in docker-compose.yml. */
function serviceEnv(name: string): Set<string> {
  const start = compose.indexOf(`\n  ${name}:\n`);
  const rest = compose.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z0-9_-]*:\n/);
  const block = next === -1 ? rest : rest.slice(0, next + 1);
  return new Set([...block.matchAll(/^ {6}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]));
}

describe('docker-compose.yml passes the settings the API reads', () => {
  const api = serviceEnv('api');
  const worker = serviceEnv('worker');

  it('finds the settings and both services', () => {
    expect(settings.length).toBeGreaterThan(40);
    expect(api.has('DATABASE_URL') && worker.has('DATABASE_URL')).toBe(true);
  });

  it('every setting reaches the api or worker container, or is development only', () => {
    const missing = settings.filter((k) => !DEV_ONLY.has(k) && !api.has(k) && !worker.has(k));
    expect(missing).toEqual([]);
  });

  it('settings for things the worker does reach the worker', () => {
    // Email, web push and Apple push are sent from the worker's queue.
    const workerNeeds = settings.filter((k) => /^(SMTP_|VAPID_|APNS_(?!HOST)|S3_|APP_URL$)/.test(k));
    expect(workerNeeds.filter((k) => !worker.has(k))).toEqual([]);
  });
});
