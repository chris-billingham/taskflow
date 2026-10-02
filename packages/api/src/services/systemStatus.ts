import { Queue } from 'bullmq';
import { prisma } from '../config/database.js';
import { getRedis, createBullMQConnection } from '../config/redis.js';
import { ALL_QUEUES, type QueueName } from '../jobs/queues.js';
import { NotFoundError, ValidationError } from '../errors/index.js';
import { RELEASE } from '../config/version.js';
import { readHeartbeat, isFresh } from './workerHeartbeat.js';

/**
 * What an admin (or a monitoring system) needs to know about the running
 * instance: dependencies, the worker, queues and failed jobs.
 */

export type CheckResult = 'ok' | 'error';

/** Database and Redis, each tried once. The API is ready when both answer. */
export async function checkDependencies(): Promise<{ healthy: boolean; checks: Record<string, CheckResult> }> {
  const [database, redis] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(
      () => 'ok' as const,
      () => 'error' as const,
    ),
    getRedis()
      .ping()
      .then(
        () => 'ok' as const,
        () => 'error' as const,
      ),
  ]);
  return { healthy: database === 'ok' && redis === 'ok', checks: { database, redis } };
}

// One read-only handle per queue, opened on first use.
const queues = new Map<QueueName, Queue>();
function queue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: createBullMQConnection() });
    queues.set(name, q);
  }
  return q;
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
}

function assertQueue(name: string): asserts name is QueueName {
  if (!(ALL_QUEUES as string[]).includes(name)) throw new ValidationError(`Unknown queue: ${name}`);
}

export interface QueueStats {
  name: QueueName;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
}

export async function queueStats(): Promise<QueueStats[]> {
  return Promise.all(
    ALL_QUEUES.map(async (name) => {
      const c = await queue(name).getJobCounts('waiting', 'prioritized', 'active', 'delayed', 'failed');
      return {
        name,
        waiting: (c.waiting ?? 0) + (c.prioritized ?? 0),
        active: c.active ?? 0,
        delayed: c.delayed ?? 0,
        failed: c.failed ?? 0,
      };
    }),
  );
}

export interface FailedJob {
  queue: QueueName;
  id: string;
  name: string;
  reason: string;
  attempts: number;
  failedAt: Date | null;
}

/** Recent failures across every queue, newest first. Each queue keeps its last 20. */
export async function failedJobs(limit = 50): Promise<FailedJob[]> {
  const perQueue = await Promise.all(
    ALL_QUEUES.map(async (name) =>
      (await queue(name).getFailed(0, limit - 1)).map((job) => ({
        queue: name,
        id: String(job.id),
        name: job.name,
        reason: job.failedReason ?? '',
        attempts: job.attemptsMade,
        failedAt: job.finishedOn ? new Date(job.finishedOn) : null,
      })),
    ),
  );
  return perQueue
    .flat()
    .sort((a, b) => (b.failedAt?.getTime() ?? 0) - (a.failedAt?.getTime() ?? 0))
    .slice(0, limit);
}

async function failedJob(queueName: string, id: string) {
  assertQueue(queueName);
  const job = await queue(queueName).getJob(id);
  if (!job || !(await job.isFailed())) throw new NotFoundError("That job isn't in the failed list any more.");
  return job;
}

export async function retryFailedJob(queueName: string, id: string): Promise<void> {
  await (await failedJob(queueName, id)).retry('failed');
}

export async function removeFailedJob(queueName: string, id: string): Promise<void> {
  await (await failedJob(queueName, id)).remove();
}

/** Everything the admin console's System page shows. */
export async function systemStatus() {
  const [{ checks }, heartbeat, queueList] = await Promise.all([
    checkDependencies(),
    readHeartbeat().catch(() => null),
    queueStats().catch(() => []),
  ]);
  return {
    version: RELEASE.version,
    commit: RELEASE.commit,
    database: checks.database,
    redis: checks.redis,
    worker: {
      status: isFresh(heartbeat) ? ('ok' as const) : ('error' as const),
      lastSeen: heartbeat ? new Date(heartbeat.at) : null,
      version: heartbeat?.version ?? null,
    },
    queues: queueList,
  };
}
