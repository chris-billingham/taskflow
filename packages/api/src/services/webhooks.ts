import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { commentSchema, taskSchema, type WebhookEvent } from '@taskflow/contract';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { NotFoundError } from '../errors/index.js';
import { RELEASE } from '../config/version.js';
import { safePost } from '../utils/safeHttp.js';
import { requireProjectAccess } from './access.js';

/**
 * Webhooks: a project's events sent as signed JSON to a URL its admins choose.
 * Events are queued and delivered by the worker with retries.
 */

/** Paused after this many failed deliveries in a row. */
export const MAX_FAILURES = 50;
/** Attempts kept in each webhook's delivery log. */
export const LOG_SIZE = 50;
/** Longest payload kept in the log, in characters. */
const LOG_PAYLOAD_MAX = 100_000;
const TIMEOUT_MS = 10_000;

export interface WebhookDelivery {
  id: string;
  event: WebhookEvent | 'ping';
  occurredAt: string;
  projectId: string;
  data: unknown;
}

/** Stored as text; only known events are ever written. */
const typed = <T extends { events: string[] }>(webhook: T) => ({ ...webhook, events: webhook.events as WebhookEvent[] });

const newSecret = () => `whsec_${randomBytes(24).toString('base64url')}`;

const PUBLIC_FIELDS = {
  id: true,
  projectId: true,
  url: true,
  events: true,
  isActive: true,
  lastDeliveryAt: true,
  lastStatus: true,
  lastError: true,
  failureCount: true,
  createdAt: true,
} as const;

export async function listWebhooks(projectId: string, userId: string) {
  await requireProjectAccess(projectId, userId, 'ADMIN');
  const rows = await prisma.webhook.findMany({ where: { projectId }, select: PUBLIC_FIELDS, orderBy: { createdAt: 'asc' } });
  return rows.map(typed);
}

export async function createWebhook(projectId: string, userId: string, input: { url: string; events: WebhookEvent[] }) {
  await requireProjectAccess(projectId, userId, 'ADMIN');
  return typed(
    await prisma.webhook.create({
      data: { projectId, createdById: userId, url: input.url, events: [...new Set(input.events)], secret: newSecret() },
      select: { ...PUBLIC_FIELDS, secret: true },
    }),
  );
}

/** The webhook, if the user administers its project. */
async function manageable(id: string, userId: string) {
  const webhook = await prisma.webhook.findUnique({ where: { id }, select: { projectId: true } });
  if (!webhook) throw new NotFoundError('Webhook not found');
  await requireProjectAccess(webhook.projectId, userId, 'ADMIN');
  return webhook;
}

export async function updateWebhook(
  id: string,
  userId: string,
  input: { url?: string; events?: WebhookEvent[]; isActive?: boolean },
) {
  await manageable(id, userId);
  const updated = await prisma.webhook.update({
    where: { id },
    data: {
      ...(input.url !== undefined && { url: input.url }),
      ...(input.events && { events: [...new Set(input.events)] }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.isActive && { failureCount: 0 }),
    },
    select: PUBLIC_FIELDS,
  });
  return typed(updated);
}

export async function rotateSecret(id: string, userId: string) {
  await manageable(id, userId);
  return typed(
    await prisma.webhook.update({ where: { id }, data: { secret: newSecret() }, select: { ...PUBLIC_FIELDS, secret: true } }),
  );
}

export async function deleteWebhook(id: string, userId: string) {
  await manageable(id, userId);
  await prisma.webhook.delete({ where: { id } });
  return { message: 'Webhook deleted' };
}

// ── Publishing ──────────────────────────────────────────────────────────────

type Enqueue = (webhookId: string, delivery: WebhookDelivery) => Promise<void>;
let enqueue: Enqueue | null = null;

/** The worker queue registers itself here (jobs/webhookDelivery.ts). */
export function setWebhookQueue(fn: Enqueue | null): void {
  enqueue = fn;
}

// Payloads use the API's own wire format (calendar dates as YYYY-MM-DD and so
// on), so a receiver can parse them with the same types as API responses.
function encode(event: WebhookEvent, data: Record<string, unknown>): unknown {
  try {
    if ('task' in data) return { task: z.encode(taskSchema, data.task as never) };
    if ('comment' in data) return { ...data, comment: z.encode(commentSchema, data.comment as never) };
  } catch (err) {
    logger.warn({ err, event }, 'webhook payload did not match the contract; sending it as is');
  }
  return data;
}

/** Queue an event for every active webhook on the project that wants it. */
export async function publish(projectId: string, event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
  const webhooks = await prisma.webhook.findMany({
    where: { projectId, isActive: true, events: { has: event } },
    select: { id: true },
  });
  if (webhooks.length === 0 || !enqueue) return;
  const occurredAt = new Date().toISOString();
  const payload = encode(event, data);
  await Promise.all(
    webhooks.map((w) => enqueue!(w.id, { id: randomUUID(), event, occurredAt, projectId, data: payload })),
  );
}

/** A test delivery, so someone setting a webhook up can see it arrive. */
export async function sendPing(id: string, userId: string) {
  const { projectId } = await manageable(id, userId);
  const delivery: WebhookDelivery = {
    id: randomUUID(),
    event: 'ping',
    occurredAt: new Date().toISOString(),
    projectId,
    data: { message: 'Taskflow can reach this webhook.' },
  };
  return deliver(id, delivery, { recordFailure: true });
}

// ── Delivery ────────────────────────────────────────────────────────────────

/** `sha256=<hex HMAC of "<timestamp>.<body>">`, as the X-Taskflow-Signature header carries. */
export function sign(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

/**
 * Send one delivery and record the outcome. Throws on failure so the queue
 * retries; `final` marks the last attempt, which counts toward pausing.
 */
export async function deliver(
  webhookId: string,
  delivery: WebhookDelivery,
  options: { final?: boolean; recordFailure?: boolean; attempt?: number } = {},
): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
  // A paused webhook gets nothing, except what someone sends by hand.
  if (!webhook || (!webhook.isActive && !options.recordFailure)) return { ok: true, status: null, error: null };

  const body = JSON.stringify(delivery);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  let status: number | null = null;
  let error: string | null = null;
  const started = Date.now();
  try {
    ({ status } = await safePost(
      webhook.url,
      body,
      {
        'content-type': 'application/json',
        'user-agent': `Taskflow-Webhook/${RELEASE.version}`,
        'x-taskflow-event': delivery.event,
        'x-taskflow-delivery': delivery.id,
        'x-taskflow-timestamp': timestamp,
        'x-taskflow-signature': sign(webhook.secret, timestamp, body),
      },
      { allowPrivate: env.WEBHOOK_ALLOW_PRIVATE_NETWORKS === 'true', timeoutMs: TIMEOUT_MS },
    ));
    if (status < 200 || status >= 300) error = `The receiver answered ${status}`;
  } catch (err) {
    error = (err as Error).message;
  }

  const ok = error === null;
  await logAttempt(webhookId, delivery, options.attempt ?? 1, status, error, Date.now() - started, body);
  const countsAsFailure = !ok && (options.final || options.recordFailure);
  const failureCount = ok ? 0 : countsAsFailure ? webhook.failureCount + 1 : webhook.failureCount;
  await prisma.webhook.update({
    where: { id: webhookId },
    data: {
      lastDeliveryAt: new Date(),
      lastStatus: status,
      lastError: error,
      failureCount,
      ...(failureCount >= MAX_FAILURES && { isActive: false }),
    },
  });
  if (failureCount >= MAX_FAILURES && webhook.isActive) {
    logger.warn({ webhookId, projectId: webhook.projectId }, 'webhook paused after repeated failures');
  }
  return { ok, status, error };
}

// ── Delivery log ────────────────────────────────────────────────────────────

async function logAttempt(
  webhookId: string,
  delivery: WebhookDelivery,
  attempt: number,
  status: number | null,
  error: string | null,
  durationMs: number,
  body: string,
): Promise<void> {
  await prisma.webhookDelivery.create({
    data: {
      webhookId,
      deliveryId: delivery.id,
      event: delivery.event,
      attempt,
      status,
      error,
      durationMs,
      payload: body.length > LOG_PAYLOAD_MAX ? body.slice(0, LOG_PAYLOAD_MAX) : body,
    },
  });
  const older = await prisma.webhookDelivery.findMany({
    where: { webhookId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: LOG_SIZE,
    select: { id: true },
  });
  if (older.length) await prisma.webhookDelivery.deleteMany({ where: { id: { in: older.map((d) => d.id) } } });
}

/** The webhook's latest delivery attempts, newest first. */
export async function listDeliveries(webhookId: string, userId: string) {
  await manageable(webhookId, userId);
  return prisma.webhookDelivery.findMany({
    where: { webhookId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: LOG_SIZE,
  });
}

/** Send a logged delivery's event again now, as a new delivery. */
export async function redeliver(webhookId: string, attemptId: string, userId: string) {
  await manageable(webhookId, userId);
  const logged = await prisma.webhookDelivery.findUnique({ where: { id: attemptId } });
  if (!logged || logged.webhookId !== webhookId) throw new NotFoundError('Delivery not found');
  let original: WebhookDelivery;
  try {
    original = JSON.parse(logged.payload) as WebhookDelivery;
  } catch {
    throw new NotFoundError('That delivery was too large to keep, so it can’t be sent again');
  }
  return deliver(webhookId, { ...original, id: randomUUID() }, { recordFailure: true });
}
