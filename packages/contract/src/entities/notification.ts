import { z } from 'zod';
import { id, instant, json, type Wire } from '../common.js';

export const notificationTypeSchema = z.enum([
  'TASK_ASSIGNED',
  'TASK_DUE_SOON',
  'TASK_OVERDUE',
  'COMMENT_ON_TASK',
  'MENTION_IN_COMMENT',
  'PROJECT_SHARED',
  'WORKSPACE_INVITE',
  'REMINDER',
]);

export const notificationSchema = z.object({
  id,
  userId: id,
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string(),
  /** Where it points, e.g. { taskId, projectId }. */
  data: json.nullable(),
  isRead: z.boolean(),
  readAt: instant.nullable(),
  digestedAt: instant.nullable(),
  createdAt: instant,
});
export type Notification = Wire<typeof notificationSchema>;

/** GET /notifications: a page of notifications plus the unread badge count. */
export const notificationListResponse = z.object({
  success: z.literal(true),
  data: z.array(notificationSchema),
  unreadCount: z.number().int(),
});

export const markAllReadResponse = z.object({
  success: z.literal(true),
  count: z.number().int(),
});

/** The saved push subscription. Its keys are not echoed back. */
export const pushSubscriptionSchema = z.object({
  id,
  endpoint: z.string(),
  createdAt: instant,
});

export const vapidKeySchema = z.object({ publicKey: z.string().nullable() });
