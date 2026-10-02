import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { buildTestApp } from '../integration/buildTestApp.js';
import { generateAccessToken } from '../../utils/jwt.js';
import * as taskService from '../../services/taskService.js';
import { deliver, setWebhookQueue, MAX_FAILURES, type WebhookDelivery } from '../../services/webhooks.js';
import { dbFixtures } from './fixtures.js';

// Calendar feeds and webhooks over HTTP, with a local server receiving deliveries.
const fx = dbFixtures('integrations');
let app: FastifyInstance;
let owner: { id: string; email: string; name: string };
let member: { id: string; email: string; name: string };
let projectId = '';
let receiver: Server;
let receiverUrl = '';
let receiverStatus = 204;
const received: { headers: IncomingHttpHeaders; body: string }[] = [];
const savedEnv = { ...env };

const auth = (u: { id: string; email: string; name: string }) => ({
  authorization: `Bearer ${generateAccessToken({ id: u.id, email: u.email, name: u.name })}`,
});

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
  owner = await fx.user('owner');
  member = await fx.user('member');
  await prisma.user.update({ where: { id: owner.id }, data: { timezone: 'Europe/London' } });
  const project = await prisma.project.create({ data: { name: 'Launch', ownerId: owner.id } });
  projectId = project.id;
  await prisma.projectMember.create({ data: { projectId, userId: member.id, role: 'MEMBER' } });

  receiver = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      res.writeHead(receiverStatus);
      res.end();
    });
  });
  await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', r));
  receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hook`;
  Object.assign(env, { WEBHOOK_ALLOW_PRIVATE_NETWORKS: 'true', APP_URL: 'https://tasks.example.com' });
});
afterAll(async () => {
  Object.assign(env, savedEnv);
  setWebhookQueue(null);
  await prisma.project.deleteMany({ where: { id: projectId } });
  await app.close();
  await fx.cleanup();
  await new Promise((r) => receiver.close(r));
  await prisma.$disconnect();
});

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe('calendar feeds', () => {
  let feedUrl = '';

  beforeAll(async () => {
    const make = (content: string, data: Record<string, unknown>) =>
      taskService.createTask({ content, projectId, ...data } as never, owner.id);
    await make('All-day task', { dueDate: day(3), priority: 1 });
    await make('Timed task, with; commas', { dueDate: day(4), dueTime: '09:30', duration: 45 });
    await make('Deadline only', { deadline: day(10) });
    const done = await make('Already done', { dueDate: day(2) });
    await taskService.completeTask(done.id, owner.id);
    await make('Far future', { dueDate: day(500) });
  });

  it('makes one feed per project, and returns it again on request', async () => {
    const first = await app.inject({ method: 'POST', url: '/api/v1/calendar-feeds', headers: auth(owner), payload: { projectId } });
    expect(first.statusCode).toBe(200);
    feedUrl = first.json().data.url;
    expect(feedUrl).toMatch(/^https:\/\/tasks\.example\.com\/api\/v1\/calendar\/[\w-]+\.ics$/);
    const again = await app.inject({ method: 'POST', url: '/api/v1/calendar-feeds', headers: auth(owner), payload: { projectId } });
    expect(again.json().data.url).toBe(feedUrl);
  });

  it('two requests at once both get the same feed', async () => {
    const other = await prisma.project.create({ data: { name: 'Race', ownerId: owner.id } });
    const both = await Promise.all(
      [1, 2].map(() => app.inject({ method: 'POST', url: '/api/v1/calendar-feeds', headers: auth(owner), payload: { projectId: other.id } })),
    );
    expect(both.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(both[0].json().data.url).toBe(both[1].json().data.url);
    await prisma.project.delete({ where: { id: other.id } });
  });

  it('serves dated open tasks as all-day and timed events, with deadlines', async () => {
    const res = await app.inject({ method: 'GET', url: new URL(feedUrl).pathname });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/calendar/);
    const ics = res.body;
    expect(ics).toContain('X-WR-CALNAME:Taskflow: Launch');
    expect(ics).toContain('SUMMARY:All-day task');
    expect(ics).toContain(`DTSTART;VALUE=DATE:${day(3).replaceAll('-', '')}`);
    expect(ics).toContain('PRIORITY:1');
    expect(ics).toContain('SUMMARY:Timed task\\, with\\; commas');
    // 09:30 in London, as UTC (BST or GMT depending on the date), lasting 45 minutes.
    expect(ics).toMatch(/DTSTART:\d{8}T0[89]3000Z\r\nDTEND:\d{8}T(09|10)1500Z/);
    expect(ics).toContain('SUMMARY:Deadline: Deadline only');
    expect(ics).not.toContain('Already done');
    expect(ics).not.toContain('Far future');
  });

  it('a filter feed lists what the filter matches', async () => {
    const filter = await prisma.filter.create({ data: { name: 'Urgent', query: 'p1', userId: owner.id } });
    const res = await app.inject({ method: 'POST', url: '/api/v1/calendar-feeds', headers: auth(owner), payload: { filterId: filter.id } });
    const ics = (await app.inject({ method: 'GET', url: new URL(res.json().data.url).pathname })).body;
    expect(ics).toContain('SUMMARY:All-day task');
    expect(ics).not.toContain('Timed task');
    // Someone else's filter can't be subscribed to.
    const other = await app.inject({ method: 'POST', url: '/api/v1/calendar-feeds', headers: auth(member), payload: { filterId: filter.id } });
    expect(other.statusCode).toBe(403);
  });

  it('a reset URL replaces the old one, and losing access ends the feed', async () => {
    const mine = (await app.inject({ method: 'POST', url: '/api/v1/calendar-feeds', headers: auth(member), payload: { projectId } })).json().data;
    expect((await app.inject({ method: 'GET', url: new URL(mine.url).pathname })).statusCode).toBe(200);

    const reset = (await app.inject({ method: 'POST', url: `/api/v1/calendar-feeds/${mine.id}/reset`, headers: auth(member) })).json().data;
    expect(reset.url).not.toBe(mine.url);
    expect((await app.inject({ method: 'GET', url: new URL(mine.url).pathname })).statusCode).toBe(404);

    await prisma.projectMember.deleteMany({ where: { projectId, userId: member.id } });
    expect((await app.inject({ method: 'GET', url: new URL(reset.url).pathname })).statusCode).toBe(404);
    await prisma.projectMember.create({ data: { projectId, userId: member.id, role: 'MEMBER' } });
  });
});

describe('webhooks', () => {
  let webhook: { id: string; secret: string };

  it('only project admins manage them', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/webhooks`,
      headers: auth(member),
      payload: { url: receiverUrl, events: ['task.completed'] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('creates one with a signing secret and sends a signed test delivery', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/webhooks`,
      headers: auth(owner),
      payload: { url: receiverUrl, events: ['task.completed', 'task.created'] },
    });
    expect(res.statusCode).toBe(201);
    webhook = res.json().data;
    expect(webhook.secret).toMatch(/^whsec_/);

    const test = await app.inject({ method: 'POST', url: `/api/v1/webhooks/${webhook.id}/test`, headers: auth(owner) });
    expect(test.json().data).toEqual({ ok: true, status: 204, error: null });
    const { headers, body } = received.at(-1)!;
    expect(headers['x-taskflow-event']).toBe('ping');
    const expected = createHmac('sha256', webhook.secret).update(`${headers['x-taskflow-timestamp']}.${body}`).digest('hex');
    expect(headers['x-taskflow-signature']).toBe(`sha256=${expected}`);
  });

  it('publishes project events in the API’s wire format', async () => {
    const queued: { webhookId: string; delivery: WebhookDelivery }[] = [];
    setWebhookQueue(async (webhookId, delivery) => void queued.push({ webhookId, delivery }));
    const task = await taskService.createTask({ content: 'Ship it', projectId, dueDate: day(1) } as never, owner.id);
    await taskService.completeTask(task.id, owner.id);
    await new Promise((r) => setTimeout(r, 100));

    expect(queued.map((q) => q.delivery.event)).toEqual(['task.created', 'task.completed']);
    const completed = queued[1].delivery;
    expect(completed).toMatchObject({ projectId, data: { task: { id: task.id, isCompleted: true, dueDate: day(1) } } });

    await deliver(queued[1].webhookId, completed);
    const last = received.at(-1)!;
    expect(last.headers['x-taskflow-event']).toBe('task.completed');
    expect(JSON.parse(last.body).data.task.content).toBe('Ship it');
  });

  it('counts failed deliveries and pauses after too many', async () => {
    receiverStatus = 500;
    const ping: WebhookDelivery = { id: 'd1', event: 'task.created', occurredAt: new Date().toISOString(), projectId, data: {} };
    // Earlier attempts are retried and don't count.
    expect((await deliver(webhook.id, ping)).ok).toBe(false);
    expect((await prisma.webhook.findUniqueOrThrow({ where: { id: webhook.id } })).failureCount).toBe(0);
    await prisma.webhook.update({ where: { id: webhook.id }, data: { failureCount: MAX_FAILURES - 1 } });
    await deliver(webhook.id, ping, { final: true });
    const paused = await prisma.webhook.findUniqueOrThrow({ where: { id: webhook.id } });
    expect(paused).toMatchObject({ isActive: false, lastStatus: 500, failureCount: MAX_FAILURES });
    receiverStatus = 204;

    const resumed = await app.inject({ method: 'PATCH', url: `/api/v1/webhooks/${webhook.id}`, headers: auth(owner), payload: { isActive: true } });
    expect(resumed.json().data).toMatchObject({ isActive: true, failureCount: 0 });
  });

  it('keeps a log of attempts that can be sent again, and only the latest 50', async () => {
    const log = (await app.inject({ method: 'GET', url: `/api/v1/webhooks/${webhook.id}/deliveries`, headers: auth(owner) })).json().data;
    expect(log.length).toBeGreaterThan(0);
    const failed = log.find((d: { status: number | null }) => d.status === 500);
    expect(failed).toMatchObject({ event: 'task.created', attempt: 1, error: 'The receiver answered 500' });
    expect(JSON.parse(failed.payload)).toMatchObject({ event: 'task.created', projectId });

    const before = received.length;
    const resent = await app.inject({
      method: 'POST',
      url: `/api/v1/webhooks/${webhook.id}/deliveries/${failed.id}/redeliver`,
      headers: auth(owner),
    });
    expect(resent.json().data).toMatchObject({ ok: true, status: 204 });
    const again = received[before];
    expect(again.headers['x-taskflow-event']).toBe('task.created');
    // A new delivery, not a retry of the old one.
    expect(again.headers['x-taskflow-delivery']).not.toBe(failed.deliveryId);

    await prisma.webhookDelivery.createMany({
      data: Array.from({ length: 55 }, (_, i) => ({
        webhookId: webhook.id, deliveryId: `old-${i}`, event: 'task.updated', attempt: 1, status: 204, durationMs: 1, payload: '{}',
        createdAt: new Date(Date.now() - 86_400_000 + i),
      })),
    });
    await app.inject({ method: 'POST', url: `/api/v1/webhooks/${webhook.id}/test`, headers: auth(owner) });
    expect(await prisma.webhookDelivery.count({ where: { webhookId: webhook.id } })).toBe(50);
    // Someone who isn't a project admin can't read it.
    const theirs = await app.inject({ method: 'GET', url: `/api/v1/webhooks/${webhook.id}/deliveries`, headers: auth(member) });
    expect(theirs.statusCode).toBe(403);
  });

  it('won’t reach private addresses unless allowed', async () => {
    env.WEBHOOK_ALLOW_PRIVATE_NETWORKS = 'false';
    const test = await app.inject({ method: 'POST', url: `/api/v1/webhooks/${webhook.id}/test`, headers: auth(owner) });
    expect(test.json().data).toMatchObject({ ok: false, status: null, error: expect.stringMatching(/private or local/) });
    env.WEBHOOK_ALLOW_PRIVATE_NETWORKS = 'true';
  });
});
