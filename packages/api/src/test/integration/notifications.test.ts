import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './buildTestApp.js';
import { generateAccessToken } from '../../utils/jwt.js';

vi.mock('../../services/notificationService.js', () => ({
  getUserNotifications: vi.fn(async () => ({ items: [], nextCursor: null })),
  getUnreadCount: vi.fn(async () => 0),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  savePushSubscription: vi.fn(),
  removePushSubscription: vi.fn(),
}));

import * as notificationService from '../../services/notificationService.js';

const USER = { id: 'user-1', email: 'ada@example.com', name: 'Ada' };
const headers = { authorization: `Bearer ${generateAccessToken(USER)}` };

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/notifications', () => {
  it('reads ?unreadOnly=false as false (it used to coerce to true)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/notifications?unreadOnly=false&limit=50', headers });

    expect(res.statusCode).toBe(200);
    expect(notificationService.getUserNotifications).toHaveBeenCalledWith(USER.id, false, 50, undefined);
  });

  it('reads ?unreadOnly=true as true', async () => {
    await app.inject({ method: 'GET', url: '/api/v1/notifications?unreadOnly=true', headers });

    expect(notificationService.getUserNotifications).toHaveBeenLastCalledWith(USER.id, true, undefined, undefined);
  });

  it('does not echo push subscription keys back', async () => {
    vi.mocked(notificationService.savePushSubscription).mockResolvedValue({
      id: 'sub-1',
      userId: USER.id,
      endpoint: 'https://push.example.com/abc',
      p256dh: 'secret-p256dh',
      auth: 'secret-auth',
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/subscribe-push',
      headers,
      payload: { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'secret-p256dh', auth: 'secret-auth' } },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.json())).not.toContain('secret-');
  });
});
