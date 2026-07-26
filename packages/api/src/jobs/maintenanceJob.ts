import { Worker, Queue } from 'bullmq';
import { createBullMQConnection } from '../config/redis.js';
import { prisma } from '../config/database.js';

const QUEUE_NAME = 'maintenance';

export function createMaintenanceQueue() {
  return new Queue(QUEUE_NAME, {
    connection: createBullMQConnection(),
    defaultJobOptions: {
      removeOnComplete: 20,
      removeOnFail: 20,
    },
  });
}

export function startMaintenanceWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      // Refresh tokens expire after 30 days but were only ever checked at
      // read time — the table grew one row per login forever.
      const tokens = await prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });

      // Expired workspace invites are dead rows nobody can accept.
      const invites = await prisma.workspaceInvite.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });

      if (tokens.count || invites.count) {
        console.log(
          `[Maintenance] pruned ${tokens.count} expired refresh tokens, ${invites.count} expired invites`,
        );
      }
    },
    {
      connection: createBullMQConnection(),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`Maintenance job ${job?.id} failed:`, err.message);
  });

  return worker;
}

export async function scheduleMaintenanceJobs(queue: Queue) {
  await queue.add(
    'daily-cleanup',
    {},
    {
      repeat: { pattern: '30 3 * * *' }, // 03:30 UTC daily
    },
  );
}
