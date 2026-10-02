import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { createBullMQConnection } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { deliver, setWebhookQueue, type WebhookDelivery } from '../services/webhooks.js';
import { QUEUE_NAMES } from './queues.js';

// Webhook deliveries, sent by the worker. Six attempts over about 15 minutes
// (30 s, 1, 2, 4 and 8 minutes apart) before a delivery counts as failed.

const QUEUE_NAME = QUEUE_NAMES.webhooks;
const ATTEMPTS = 6;

interface Job {
  webhookId: string;
  delivery: WebhookDelivery;
}

let producer: Queue<Job> | null = null;

/** Let the API queue webhook deliveries. Called once at start-up. */
export function initWebhookQueue(): void {
  setWebhookQueue(async (webhookId, delivery) => {
    if (!producer) {
      const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
      connection.on('error', (err: Error) => logger.error({ err }, 'Webhook queue Redis connection error'));
      producer = new Queue<Job>(QUEUE_NAME, {
        connection,
        defaultJobOptions: {
          attempts: ATTEMPTS,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 200,
          removeOnFail: 20,
        },
      });
    }
    await producer.add('deliver', { webhookId, delivery }, { jobId: delivery.id });
  });
}

export function startWebhookWorker() {
  const worker = new Worker<Job>(
    QUEUE_NAME,
    async (job) => {
      const final = job.attemptsMade + 1 >= (job.opts.attempts ?? ATTEMPTS);
      const result = await deliver(job.data.webhookId, job.data.delivery, { final });
      if (!result.ok) throw new Error(result.error ?? 'Delivery failed');
    },
    { connection: createBullMQConnection(), concurrency: 5 },
  );
  worker.on('failed', (job, err) =>
    logger.warn({ err: err.message, webhookId: job?.data.webhookId, attempt: job?.attemptsMade }, 'webhook delivery failed'),
  );
  return worker;
}
