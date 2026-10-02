import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import { createBullMQConnection } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { sendApplePush, sendEmailNotification, sendWebPush } from '../services/notificationService.js';
import { QUEUE_NAMES } from './queues.js';

// Email and push for a notification, sent by the worker. The in-app
// notification is saved (and shown live) in the request itself; only the
// slow, failure-prone sending happens here, with retries.

const QUEUE_NAME = QUEUE_NAMES.delivery;

let producer: Queue | null = null;

function deliveryQueue() {
  if (!producer) {
    // Fail fast when Redis is unreachable rather than waiting for it to come
    // back (the default for BullMQ connections), so the caller can send the
    // notification directly instead.
    const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
    connection.on('error', (err: Error) => logger.error({ err }, 'Notification queue Redis connection error'));
    producer = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 4,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 500,
        removeOnFail: 200,
      },
    });
  }
  return producer;
}

export type Channel = 'webpush' | 'apns' | 'email';

/**
 * Send a saved notification's email and push, skipping channels already
 * done. Reports which channels failed in a way worth retrying (a mail
 * server or push service down), so the queue can try those again later
 * without repeating the ones that worked.
 */
export async function deliverNotification(
  notificationId: string,
  skip: Channel[] = [],
): Promise<{ delivered: Channel[]; failed: Channel[] }> {
  const n = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { userId: true, type: true, title: true, body: true, data: true },
  });
  if (!n) return { delivered: [], failed: [] }; // deleted with its user in the meantime
  const data = (n.data ?? {}) as Record<string, unknown>;
  const send: Record<Channel, () => Promise<void>> = {
    webpush: () => sendWebPush(n.userId, n.title, n.body, data, true),
    apns: () => sendApplePush(n.userId, n.title, n.body, data, true),
    email: () => sendEmailNotification(n.userId, n.type, { subject: n.title, summary: n.body, ...data }, false, true),
  };
  const delivered: Channel[] = [];
  const failed: Channel[] = [];
  for (const channel of (Object.keys(send) as Channel[]).filter((c) => !skip.includes(c))) {
    try {
      await send[channel]();
      delivered.push(channel);
    } catch {
      failed.push(channel); // logged by the sender
    }
  }
  return { delivered, failed };
}

/**
 * Hand a notification's email and push to the worker, or send them now when
 * delivery is inline or the queue can't be reached.
 */
export async function scheduleDelivery(notificationId: string) {
  if (env.NOTIFICATION_DELIVERY === 'queue') {
    try {
      // The notification id as job id: queuing the same one twice sends once.
      await deliveryQueue().add('deliver', { notificationId }, { jobId: notificationId });
      return;
    } catch (err) {
      logger.warn({ err, notificationId }, 'notification queue unavailable; sending directly');
    }
  }
  await deliverNotification(notificationId);
}

export function startNotificationDeliveryWorker() {
  const worker = new Worker<{ notificationId: string; done?: Channel[] }>(
    QUEUE_NAME,
    async (job) => {
      const done = job.data.done ?? [];
      const { delivered, failed } = await deliverNotification(job.data.notificationId, done);
      if (failed.length) {
        // Remember what worked, so the retry sends only what didn't.
        await job.updateData({ ...job.data, done: [...done, ...delivered] });
        throw new Error(`Couldn't send by ${failed.join(' and ')}; will try again`);
      }
    },
    { connection: createBullMQConnection(), concurrency: 5 },
  );
  worker.on('failed', (job, err) =>
    logger.warn({ err: err.message, jobId: job?.id, attempt: job?.attemptsMade }, 'notification delivery failed'),
  );
  return worker;
}

export async function closeDeliveryQueue() {
  await producer?.close();
  producer = null;
}
