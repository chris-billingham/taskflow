import { Worker, Queue } from 'bullmq';
import { createBullMQConnection } from '../config/redis.js';
import { prisma } from '../config/database.js';
import { sendEmailNotification } from '../services/notificationService.js';
import { isValidTimeZone } from '../utils/dates.js';

const QUEUE_NAME = 'notification-digest';

// Local hour at which a user receives their digest.
const DIGEST_LOCAL_HOUR = 8;

/** Hour (0-23) and ISO weekday (1 = Monday) as read in `tz` at `at`. */
function localHourAndWeekday(tz: string, at: Date): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(at);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const weekdayName = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const weekday =
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekdayName) + 1;

  return { hour, weekday };
}

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
      const now = new Date();
      const since = new Date(now);

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

      // Send at DIGEST_LOCAL_HOUR in each user's own timezone. This job now
      // runs hourly and each user qualifies in exactly one of those runs — the
      // old schedule fired once at 08:00 UTC, which is the middle of the night
      // for a large share of any real user base.
      const tzRows = await prisma.user.findMany({
        where: { id: { in: usersWithNotifications.map((u) => u.userId) } },
        select: { id: true, timezone: true },
      });
      const tzByUser = new Map(tzRows.map((u) => [u.id, u.timezone]));
      const isLocalSendTime = (userId: string) => {
        const raw = tzByUser.get(userId);
        const tz = raw && isValidTimeZone(raw) ? raw : 'UTC';
        const { hour, weekday } = localHourAndWeekday(tz, now);
        if (hour !== DIGEST_LOCAL_HOUR) return false;
        // Weekly digests additionally wait for the user's Monday.
        return period === 'weekly' ? weekday === 1 : true;
      };

      for (const { userId, _count } of usersWithNotifications) {
        if (_count.id === 0) continue;
        if (!wantsThisDigest(userId)) continue;
        if (!isLocalSendTime(userId)) continue;

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
  // Both digests run HOURLY and each user is selected in whichever pass lands
  // on 08:00 in their own timezone (Monday 08:00 for the weekly). The previous
  // schedule was a single 08:00 UTC pass, which ignored User.timezone
  // entirely and delivered in the small hours for much of the world.
  await queue.add(
    'daily-digest',
    { period: 'daily' },
    { repeat: { pattern: '0 * * * *' } },
  );

  await queue.add(
    'weekly-digest',
    { period: 'weekly' },
    { repeat: { pattern: '0 * * * *' } },
  );
}
