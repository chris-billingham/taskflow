import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Queue, Worker } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../config/database.js';
import { createBullMQConnection, closeRedis } from '../../config/redis.js';
import { buildTestApp } from '../integration/buildTestApp.js';
import { generateAccessToken } from '../../utils/jwt.js';
import { QUEUE_NAMES } from '../../jobs/queues.js';
import { startHeartbeat } from '../../services/workerHeartbeat.js';
import { closeQueues } from '../../services/systemStatus.js';
import { dbFixtures } from './fixtures.js';

// The admin console's System page and /metrics, against real Redis queues.
const fx = dbFixtures('system');
let app: FastifyInstance;
let admin: Record<string, string>;
let member: Record<string, string>;
const QUEUE = QUEUE_NAMES.maintenance;

const auth = (user: { id: string; email: string; name: string }) => ({
  authorization: `Bearer ${generateAccessToken({ id: user.id, email: user.email, name: user.name })}`,
});

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
  const a = await fx.user('admin');
  await prisma.user.update({ where: { id: a.id }, data: { role: 'ADMIN' } });
  admin = auth(a);
  member = auth(await fx.user('member'));
  await new Queue(QUEUE, { connection: createBullMQConnection() }).obliterate({ force: true });
});
afterAll(async () => {
  await closeQueues();
  await app.close();
  await fx.cleanup();
  await closeRedis();
  await prisma.$disconnect();
});

/** Run one job on the maintenance queue that fails, and return its id. */
async function failAJob(): Promise<string> {
  const queue = new Queue(QUEUE, { connection: createBullMQConnection() });
  const job = await queue.add('broken', {}, { attempts: 1, removeOnFail: 20 });
  const worker = new Worker(
    QUEUE,
    async () => {
      throw new Error('SMTP server said no');
    },
    { connection: createBullMQConnection() },
  );
  await new Promise<void>((resolve) => worker.on('failed', () => resolve()));
  await worker.close();
  await queue.close();
  return job.id!;
}

describe('admin system status', () => {
  it('is for admins only', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/system', headers: member });
    expect(res.statusCode).toBe(403);
  });

  it('reports the release, dependencies, the worker and queue depth', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/v1/admin/system', headers: admin });
    expect(before.statusCode).toBe(200);
    expect(before.json().data).toMatchObject({ version: 'dev', database: 'ok', redis: 'ok' });

    const stop = startHeartbeat();
    await new Promise((r) => setTimeout(r, 200));
    const after = (await app.inject({ method: 'GET', url: '/api/v1/admin/system', headers: admin })).json().data;
    stop();
    expect(after.worker).toMatchObject({ status: 'ok', version: 'dev' });
    expect(after.queues.map((q: { name: string }) => q.name)).toEqual(Object.values(QUEUE_NAMES));
  });

  it('lists failed jobs, runs one again, and discards one', async () => {
    const id = await failAJob();
    const list = (await app.inject({ method: 'GET', url: '/api/v1/admin/jobs/failed', headers: admin })).json().data;
    expect(list).toContainEqual(
      expect.objectContaining({ queue: QUEUE, id, name: 'broken', reason: 'SMTP server said no', attempts: 1 }),
    );

    const retried = await app.inject({ method: 'POST', url: `/api/v1/admin/jobs/${QUEUE}/${id}/retry`, headers: admin });
    expect(retried.statusCode).toBe(200);
    const queue = new Queue(QUEUE, { connection: createBullMQConnection() });
    expect(await (await queue.getJob(id))!.getState()).toBe('waiting');
    // It's no longer failed, so it can't be retried twice.
    const again = await app.inject({ method: 'POST', url: `/api/v1/admin/jobs/${QUEUE}/${id}/retry`, headers: admin });
    expect(again.statusCode).toBe(404);
    await queue.obliterate({ force: true });
    await queue.close();

    const second = await failAJob();
    const removed = await app.inject({ method: 'DELETE', url: `/api/v1/admin/jobs/${QUEUE}/${second}`, headers: admin });
    expect(removed.statusCode).toBe(200);
    const after = (await app.inject({ method: 'GET', url: '/api/v1/admin/jobs/failed', headers: admin })).json().data;
    expect(after.find((j: { id: string }) => j.id === second)).toBeUndefined();
  });

  it('refuses queues it doesn’t know', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/jobs/nope/1/retry', headers: admin });
    expect(res.statusCode).toBe(400);
  });
});

describe('health and metrics', () => {
  it('separates liveness from readiness', async () => {
    const live = await app.inject({ method: 'GET', url: '/health/live' });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toMatchObject({ status: 'ok' });
    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: 'ok' });
  });

  it('serves Prometheus metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain; version=0\.0\.4/);
    expect(res.body).toContain('taskflow_info{version="dev",commit=""} 1');
    expect(res.body).toContain('taskflow_up{dependency="database"} 1');
    expect(res.body).toContain(`taskflow_queue_jobs{queue="${QUEUE}",state="failed"}`);
    expect(res.body).toMatch(/^taskflow_users\{state="active"\} \d+$/m);
  });
});
