import { Worker, Queue } from 'bullmq';
import { createBullMQConnection } from '../config/redis.js';
import { prisma } from '../config/database.js';
import { sweepOrphanedAttachments } from '../services/fileService.js';
import { logger } from '../config/logger.js';

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

      // Attachments orphaned by cascades (workspace/account deletion paths
      // that don't collect keys inline) — reclaim rows + object bytes.
      const swept = await sweepOrphanedAttachments();

      if (tokens.count || invites.count || swept) {
        logger.info(
          { refreshTokens: tokens.count, invites: invites.count, orphanedAttachments: swept },
          'maintenance pruned expired rows',
        );
      }
    },
    {
      connection: createBullMQConnection(),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'maintenance job failed');
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
