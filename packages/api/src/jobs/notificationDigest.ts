import { Worker, Queue } from 'bullmq';
import { createBullMQConnection } from '../config/redis.js';
import { prisma } from '../config/database.js';
import { sendEmailNotification } from '../services/notificationService.js';

const QUEUE_NAME = 'notification-digest';

export function createDigestQueue() {
  return new Queue(QUEUE_NAME, {
    connection: createBullMQConnection(),
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

      // Find users who have unread, not-yet-digested notifications in the
      // period. digestedAt is the watermark: without it, the daily and weekly
      // windows overlap and the same items get emailed repeatedly.
      const usersWithNotifications = await prisma.notification.groupBy({
        by: ['userId'],
        where: {
          isRead: false,
          digestedAt: null,
          createdAt: { gte: since },
        },
        _count: { id: true },
      });

      // Respect preferences: a digest only goes to users who want email AND
      // chose THIS cadence ("immediate" users were emailed at creation time).
      const prefRows = await prisma.notificationPreference.findMany({
        where: { userId: { in: usersWithNotifications.map((u) => u.userId) } },
      });
      const prefByUser = new Map(prefRows.map((p) => [p.userId, p]));
      const wantsThisDigest = (userId: string) => {
        const p = prefByUser.get(userId);
        const emailEnabled = p?.emailEnabled ?? true;
        const frequency = p?.emailFrequency ?? 'daily';
        return emailEnabled && frequency === period;
      };

      for (const { userId, _count } of usersWithNotifications) {
        if (_count.id === 0) continue;
        if (!wantsThisDigest(userId)) continue;

        const notifications = await prisma.notification.findMany({
          where: {
            userId,
            isRead: false,
            digestedAt: null,
            createdAt: { gte: since },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });
        if (notifications.length === 0) continue;

        const summary = notifications.map((n) => `- ${n.title}: ${n.body}`).join('\n');

        // The type is inert for digests (subject and summary are supplied
        // below), and the frequency gate is bypassed explicitly: this job has
        // already established the user asked for exactly this cadence.
        await sendEmailNotification(
          userId,
          'TASK_DUE_SOON',
          {
            subject: `Your ${period} Taskflow digest`,
            summary,
            count: _count.id,
            period,
          },
          true,
        );

        // Mark AFTER the send so a failed send retries next period.
        await prisma.notification.updateMany({
          where: { id: { in: notifications.map((n) => n.id) } },
          data: { digestedAt: new Date() },
        });
      }
    },
    {
      connection: createBullMQConnection(),
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
