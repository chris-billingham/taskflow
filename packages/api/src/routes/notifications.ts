import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/authenticate.js';
import { ValidationError } from '../errors/index.js';
import * as notificationService from '../services/notificationService.js';
import { z } from 'zod';

const notificationQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

const markReadSchema = z.object({
  notificationId: z.string().min(1, 'Notification ID is required'),
});

const subscribePushSchema = z.object({
  endpoint: z.string().url('Invalid endpoint URL'),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribePushSchema = z.object({
  endpoint: z.string().url('Invalid endpoint URL'),
});

export async function notificationRoutes(app: FastifyInstance) {
  // GET /api/v1/notifications/vapid-public-key — served by the API so a
  // self-hosted deployment doesn't need a frontend rebuild to enable push.
  app.get('/notifications/vapid-public-key', async (_request, reply) => {
    return reply.send({
      success: true,
      data: { publicKey: env.VAPID_PUBLIC_KEY ?? null },
    });
  });

  app.addHook('preHandler', authenticate);

  // GET /api/v1/notifications - Get user notifications
  app.get('/notifications', async (request, reply) => {
    const query = notificationQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw new ValidationError(query.error.issues[0].message);
    }

    const [data, unreadCount] = await Promise.all([
      notificationService.getUserNotifications(
        request.user.id,
        query.data.unreadOnly,
        query.data.limit,
        query.data.cursor,
      ),
      notificationService.getUnreadCount(request.user.id),
    ]);

    return reply.send({ success: true, data, unreadCount });
  });

  // POST /api/v1/notifications/mark-read - Mark a notification as read
  app.post('/notifications/mark-read', async (request, reply) => {
    const body = markReadSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await notificationService.markAsRead(
      body.data.notificationId,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // POST /api/v1/notifications/mark-all-read - Mark all notifications as read
  app.post('/notifications/mark-all-read', async (request, reply) => {
    const data = await notificationService.markAllAsRead(request.user.id);
    return reply.send({ success: true, ...data });
  });

  // POST /api/v1/notifications/subscribe-push - Subscribe to push notifications
  app.post('/notifications/subscribe-push', async (request, reply) => {
    const body = subscribePushSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await notificationService.savePushSubscription(
      request.user.id,
      body.data.endpoint,
      body.data.keys.p256dh,
      body.data.keys.auth,
    );
    return reply.send({ success: true, data });
  });

  // POST /api/v1/notifications/unsubscribe-push - Unsubscribe from push
  app.post('/notifications/unsubscribe-push', async (request, reply) => {
    const body = unsubscribePushSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    await notificationService.removePushSubscription(
      body.data.endpoint,
      request.user.id,
    );
    return reply.send({ success: true, message: 'Unsubscribed from push notifications' });
  });
}
