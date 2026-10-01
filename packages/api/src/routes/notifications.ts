import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  notificationQuerySchema,
  markReadSchema,
  subscribePushSchema,
  unsubscribePushSchema,
  notificationSchema,
  notificationListResponse,
  markAllReadResponse,
  pushSubscriptionSchema,
  vapidKeySchema,
  messageResponse,
  registerAppleDeviceSchema,
  appleDeviceParamsSchema,
  ok,
} from '@taskflow/contract';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/authenticate.js';
import * as notificationService from '../services/notificationService.js';

const tags = ['Notifications'];

export async function notificationRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Served by the API so a self-hosted deployment doesn't need a frontend
  // rebuild to enable push. Public: it's a public key.
  app.get(
    '/notifications/vapid-public-key',
    {
      schema: {
        tags,
        summary: 'The Web Push public key (null when push is not configured)',
        security: [],
        response: { 200: ok(vapidKeySchema) },
      },
    },
    async () => ({ success: true as const, data: { publicKey: env.VAPID_PUBLIC_KEY ?? null } }),
  );

  app.addHook('preHandler', authenticate);

  app.get(
    '/notifications',
    {
      schema: {
        tags,
        summary: 'Your notifications, newest first, with the unread count',
        querystring: notificationQuerySchema,
        response: { 200: notificationListResponse },
      },
    },
    async (request) => {
      const [{ items, nextCursor }, unreadCount] = await Promise.all([
        notificationService.getUserNotifications(
          request.user.id,
          request.query.unreadOnly,
          request.query.limit,
          request.query.cursor,
        ),
        notificationService.getUnreadCount(request.user.id),
      ]);
      return { success: true as const, data: items, nextCursor, unreadCount };
    },
  );

  app.post(
    '/notifications/mark-read',
    {
      schema: { tags, summary: 'Mark a notification read', body: markReadSchema, response: { 200: ok(notificationSchema) } },
    },
    async (request) => ({
      success: true as const,
      data: await notificationService.markAsRead(request.body.notificationId, request.user.id),
    }),
  );

  app.post(
    '/notifications/mark-all-read',
    { schema: { tags, summary: 'Mark all your notifications read', response: { 200: markAllReadResponse } } },
    async (request) => ({
      success: true as const,
      ...(await notificationService.markAllAsRead(request.user.id)),
    }),
  );

  app.post(
    '/notifications/subscribe-push',
    {
      schema: {
        tags,
        summary: "Register this browser's push subscription",
        body: subscribePushSchema,
        response: { 200: ok(pushSubscriptionSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await notificationService.savePushSubscription(
        request.user.id,
        request.body.endpoint,
        request.body.keys.p256dh,
        request.body.keys.auth,
      ),
    }),
  );

  app.post(
    '/notifications/unsubscribe-push',
    {
      schema: {
        tags,
        summary: "Remove this browser's push subscription",
        body: unsubscribePushSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => {
      await notificationService.removePushSubscription(request.body.endpoint, request.user.id);
      return { success: true as const, message: 'Unsubscribed from push notifications' };
    },
  );

  // The iOS app registers its APNs token here after each sign-in. Needs a
  // signed-in session (the device is tied to it), so not an access token.
  app.post(
    '/push/apple',
    {
      config: { sessionOnly: true },
      schema: {
        tags,
        summary: "Register this iPhone or iPad's APNs device token",
        body: registerAppleDeviceSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => {
      await notificationService.registerAppleDevice(request.user.id, request.user.sid, request.body);
      return { success: true as const, message: 'Registered for push notifications' };
    },
  );

  app.delete(
    '/push/apple/:token',
    {
      config: { sessionOnly: true },
      schema: {
        tags,
        summary: 'Stop push notifications to this device',
        params: appleDeviceParamsSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => {
      await notificationService.removeAppleDevice(request.user.id, request.params.token);
      return { success: true as const, message: 'Unregistered from push notifications' };
    },
  );
}
