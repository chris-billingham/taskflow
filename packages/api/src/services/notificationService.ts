import webpush from 'web-push';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { NotFoundError, ForbiddenError } from '../errors/index.js';
import { isMailerReady, sendNotificationEmail } from './mailService.js';
import type { NotificationType } from '@prisma/client';

// ─── Notification Preferences ────────────────────────────────────────────

export interface NotificationPrefs {
  emailEnabled: boolean;
  emailFrequency: 'immediate' | 'daily' | 'weekly';
  disabledTypes: NotificationType[];
}

const DEFAULT_PREFS: NotificationPrefs = {
  emailEnabled: true,
  emailFrequency: 'daily',
  disabledTypes: [],
};

export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPrefs> {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId },
  });
  if (!row) return DEFAULT_PREFS;
  return {
    emailEnabled: row.emailEnabled,
    emailFrequency: row.emailFrequency as NotificationPrefs['emailFrequency'],
    disabledTypes: row.disabledTypes,
  };
}

export async function updateNotificationPreferences(
  userId: string,
  data: Partial<NotificationPrefs>,
): Promise<NotificationPrefs> {
  const row = await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return {
    emailEnabled: row.emailEnabled,
    emailFrequency: row.emailFrequency as NotificationPrefs['emailFrequency'],
    disabledTypes: row.disabledTypes,
  };
}

// ─── In-App Notifications ────────────────────────────────────────────────

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  // Muted types are suppressed at the source — no in-app entry, and nothing
  // downstream (push/email/digest) ever sees them. REMINDER is never muted:
  // reminders are explicitly created by the user per task.
  if (type !== 'REMINDER') {
    const prefs = await getNotificationPreferences(userId);
    if (prefs.disabledTypes.includes(type)) return null;
  }

  return prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      data: data ? JSON.parse(JSON.stringify(data)) : undefined,
    },
  });
}

export async function getUserNotifications(
  userId: string,
  unreadOnly = false,
  limit = 50,
  cursor?: string,
) {
  return prisma.notification.findMany({
    where: {
      userId,
      ...(unreadOnly ? { isRead: false } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });
}

export async function getUnreadCount(userId: string) {
  return prisma.notification.count({
    where: { userId, isRead: false },
  });
}

export async function markAsRead(notificationId: string, userId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });
  if (!notification) {
    throw new NotFoundError('Notification not found');
  }
  if (notification.userId !== userId) {
    throw new ForbiddenError('Not your notification');
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function markAllAsRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { count: result.count };
}

// ─── Push Notifications ──────────────────────────────────────────────────

export async function savePushSubscription(
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string,
) {
  return prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId, p256dh, auth },
    create: { userId, endpoint, p256dh, auth },
  });
}

export async function removePushSubscription(endpoint: string, userId: string) {
  const sub = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  if (!sub) return;
  if (sub.userId !== userId) {
    throw new ForbiddenError('Not your subscription');
  }
  await prisma.pushSubscription.delete({ where: { endpoint } });
}

export async function getUserPushSubscriptions(userId: string) {
  return prisma.pushSubscription.findMany({ where: { userId } });
}

let vapidConfigured: boolean | null = null;

/** True when VAPID keys are configured (checked once, lazily). */
export function isPushConfigured(): boolean {
  if (vapidConfigured === null) {
    if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        env.VAPID_SUBJECT,
        env.VAPID_PUBLIC_KEY,
        env.VAPID_PRIVATE_KEY,
      );
      vapidConfigured = true;
    } else {
      vapidConfigured = false;
    }
  }
  return vapidConfigured;
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  if (!isPushConfigured()) return;

  const subscriptions = await getUserPushSubscriptions(userId);
  const payload = JSON.stringify({ title, body, data });

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      // 404/410: the browser revoked this subscription — it's dead, drop it.
      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription
          .delete({ where: { endpoint: sub.endpoint } })
          .catch(() => {});
      } else {
        console.error(
          `[Push] delivery failed for user ${userId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
}

// ─── Email Notifications ─────────────────────────────────────────────────

export async function sendEmailNotification(
  userId: string,
  type: NotificationType,
  data: Record<string, unknown>,
) {
  if (!isMailerReady()) return;

  const prefs = await getNotificationPreferences(userId);
  if (!prefs.emailEnabled) return;
  // Non-reminder notifications only email immediately when the user chose
  // "immediate" — otherwise the daily/weekly digest covers them. Reminders
  // are time-critical and were explicitly requested, so they always send.
  if (type !== 'REMINDER' && type !== 'TASK_DUE_SOON' && prefs.emailFrequency !== 'immediate') {
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (!user) return;

  const subject =
    typeof data.subject === 'string'
      ? data.subject
      : type === 'REMINDER'
        ? `Reminder: ${String(data.taskContent ?? 'a task needs your attention')}`
        : 'Taskflow notification';
  const body =
    typeof data.summary === 'string'
      ? data.summary
      : type === 'REMINDER'
        ? `Your reminder for "${String(data.taskContent ?? 'a task')}" is due.`
        : JSON.stringify(data);

  try {
    await sendNotificationEmail(user.email, user.name, subject, body);
  } catch (err) {
    console.error(
      `[Email] notification send failed for ${user.email}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
