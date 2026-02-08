import { prisma } from '../config/database.js';
import { NotFoundError, ForbiddenError } from '../errors/index.js';
import type { NotificationType } from '@prisma/client';

// ─── In-App Notifications ────────────────────────────────────────────────

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
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

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  _data?: Record<string, unknown>,
) {
  // Web Push sending requires the web-push library and VAPID keys.
  // For now, we store the notification and log the push attempt.
  // In production, integrate with web-push:
  //   import webpush from 'web-push';
  //   webpush.setVapidDetails(subject, publicKey, privateKey);
  //   const subs = await getUserPushSubscriptions(userId);
  //   for (const sub of subs) {
  //     await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title, body, _data }));
  //   }
  console.log(`[Push] Would send to user ${userId}: ${title} - ${body}`);
}

// ─── Email Notifications ─────────────────────────────────────────────────

export async function sendEmailNotification(
  userId: string,
  _type: NotificationType,
  data: Record<string, unknown>,
) {
  // Email sending requires nodemailer configuration with SMTP.
  // For now, log the email notification attempt.
  // In production, integrate with nodemailer:
  //   import { createTransport } from 'nodemailer';
  //   const user = await prisma.user.findUnique({ where: { id: userId } });
  //   transporter.sendMail({ to: user.email, subject: ..., html: ... });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  console.log(`[Email] Would send ${_type} notification to ${user?.email}`, data);
}
