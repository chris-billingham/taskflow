import { z } from 'zod';

export const notificationQuerySchema = z.object({
  // stringbool, not coerce.boolean: coercion turned "false" into true, so
  // ?unreadOnly=false (what the bell sends) returned only unread items.
  unreadOnly: z.stringbool().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

export const markReadSchema = z.object({
  notificationId: z.string().min(1, 'Notification ID is required'),
});

export const subscribePushSchema = z.object({
  endpoint: z.url('Invalid endpoint URL'),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const unsubscribePushSchema = z.object({
  endpoint: z.url('Invalid endpoint URL'),
});
