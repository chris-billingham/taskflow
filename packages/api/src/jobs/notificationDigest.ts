import { Worker, Queue } from 'bullmq';
import { getRedis } from '../config/redis.js';
import { prisma } from '../config/database.js';
import { sendEmailNotification } from '../services/notificationService.js';

const QUEUE_NAME = 'notification-digest';

export function createDigestQueue() {
  return new Queue(QUEUE_NAME, {
    connection: getRedis(),
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: 20,
    },
  });
}

export function startDigestWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { period } = job.data as { period: 'daily' | 'weekly' };
      const since = new Date();

      if (period === 'daily') {
        since.setDate(since.getDate() - 1);
      } else {
        since.setDate(since.getDate() - 7);
      }

      // Find users who have unread notifications since the period
      const usersWithNotifications = await prisma.notification.groupBy({
        by: ['userId'],
        where: {
          isRead: false,
          createdAt: { gte: since },
        },
        _count: { id: true },
      });

      for (const { userId, _count } of usersWithNotifications) {
        if (_count.id === 0) continue;

        // Get the unread notifications for the digest
        const notifications = await prisma.notification.findMany({
          where: {
            userId,
            isRead: false,
            createdAt: { gte: since },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });

        const summary = notifications.map((n) => `- ${n.title}: ${n.body}`).join('\n');

        await sendEmailNotification(userId, 'TASK_DUE_SOON', {
          subject: `Your ${period} Taskflow digest`,
          summary,
          count: _count.id,
          period,
        });
      }
    },
    {
      connection: getRedis(),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`Digest job ${job?.id} failed:`, err.message);
  });

  return worker;
}

export async function scheduleDigestJobs(queue: Queue) {
  // Daily digest at 8 AM UTC
  await queue.add(
    'daily-digest',
    { period: 'daily' },
    {
      repeat: { pattern: '0 8 * * *' }, // cron: 8 AM every day
    },
  );

  // Weekly digest on Monday at 8 AM UTC
  await queue.add(
    'weekly-digest',
    { period: 'weekly' },
    {
      repeat: { pattern: '0 8 * * 1' }, // cron: 8 AM every Monday
    },
  );
}
