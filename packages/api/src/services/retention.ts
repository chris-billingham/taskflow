import { prisma } from '../config/database.js';
import { env } from '../config/env.js';

const DAY_MS = 86_400_000;

/** Unread notifications are kept this many times longer than read ones. */
export const UNREAD_RETENTION_FACTOR = 4;

interface RetentionSettings {
  activityDays: number;
  notificationDays: number;
}

/**
 * Delete history older than the configured retention: activity entries, and
 * notifications (read ones sooner than unread). Both tables otherwise grow
 * by a row for nearly every action, forever. A setting of 0 keeps that
 * history. Run nightly by the maintenance job.
 */
export async function pruneHistory(
  now = new Date(),
  settings: RetentionSettings = {
    activityDays: env.ACTIVITY_RETENTION_DAYS,
    notificationDays: env.NOTIFICATION_RETENTION_DAYS,
  },
): Promise<{ activity: number; notifications: number }> {
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS);

  let activity = 0;
  if (settings.activityDays > 0) {
    activity = (await prisma.activityLog.deleteMany({ where: { createdAt: { lt: before(settings.activityDays) } } })).count;
  }

  let notifications = 0;
  if (settings.notificationDays > 0) {
    notifications = (
      await prisma.notification.deleteMany({
        where: {
          OR: [
            { isRead: true, createdAt: { lt: before(settings.notificationDays) } },
            { createdAt: { lt: before(settings.notificationDays * UNREAD_RETENTION_FACTOR) } },
          ],
        },
      })
    ).count;
  }

  return { activity, notifications };
}
