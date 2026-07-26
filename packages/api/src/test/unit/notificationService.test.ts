import { describe, it, expect, vi, beforeEach } from 'vitest';

const envState = vi.hoisted(() => ({
  VAPID_PUBLIC_KEY: undefined as string | undefined,
  VAPID_PRIVATE_KEY: undefined as string | undefined,
  VAPID_SUBJECT: 'mailto:test@test.local',
}));

vi.mock('../../config/env.js', () => ({ env: envState }));

vi.mock('../../config/database.js', () => ({
  prisma: {
    notification: { create: vi.fn() },
    notificationPreference: { findUnique: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn() },
    pushSubscription: { findMany: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock('../../services/mailService.js', () => ({
  isMailerReady: vi.fn(() => true),
  sendNotificationEmail: vi.fn(() => Promise.resolve()),
}));

const sendNotificationMock = vi.hoisted(() => vi.fn());
const setVapidDetailsMock = vi.hoisted(() => vi.fn());
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: setVapidDetailsMock,
    sendNotification: sendNotificationMock,
  },
}));

import { prisma } from '../../config/database.js';
import { isMailerReady, sendNotificationEmail } from '../../services/mailService.js';

const mockPrisma = prisma as unknown as {
  notification: { create: ReturnType<typeof vi.fn> };
  notificationPreference: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  user: { findUnique: ReturnType<typeof vi.fn> };
  pushSubscription: {
    findMany: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};
const mockIsMailerReady = vi.mocked(isMailerReady);
const mockSendNotificationEmail = vi.mocked(sendNotificationEmail);

// isPushConfigured caches per module instance — load fresh for each test.
async function loadService() {
  vi.resetModules();
  return import('../../services/notificationService.js');
}

beforeEach(() => {
  vi.clearAllMocks();
  envState.VAPID_PUBLIC_KEY = undefined;
  envState.VAPID_PRIVATE_KEY = undefined;
  mockIsMailerReady.mockReturnValue(true);
  mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);
  mockPrisma.notification.create.mockResolvedValue({ id: 'n1' });
  mockPrisma.user.findUnique.mockResolvedValue({
    email: 'u@example.com',
    name: 'User',
  });
  mockPrisma.pushSubscription.findMany.mockResolvedValue([]);
});

describe('createNotification preference gating', () => {
  it('suppresses muted types everywhere (no row is ever created)', async () => {
    const svc = await loadService();
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      emailEnabled: true,
      emailFrequency: 'daily',
      disabledTypes: ['COMMENT_ON_TASK'],
    });

    const result = await svc.createNotification('u1', 'COMMENT_ON_TASK', 't', 'b');
    expect(result).toBeNull();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it('creates notifications for unmuted types', async () => {
    const svc = await loadService();
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      emailEnabled: true,
      emailFrequency: 'daily',
      disabledTypes: ['COMMENT_ON_TASK'],
    });

    await svc.createNotification('u1', 'TASK_ASSIGNED', 't', 'b');
    expect(mockPrisma.notification.create).toHaveBeenCalledOnce();
  });

  it('REMINDER can never be muted (skips the prefs lookup entirely)', async () => {
    const svc = await loadService();
    await svc.createNotification('u1', 'REMINDER', 't', 'b');
    expect(mockPrisma.notification.create).toHaveBeenCalledOnce();
    expect(mockPrisma.notificationPreference.findUnique).not.toHaveBeenCalled();
  });
});

describe('sendEmailNotification routing', () => {
  it('does nothing when the mailer is not ready', async () => {
    const svc = await loadService();
    mockIsMailerReady.mockReturnValue(false);
    await svc.sendEmailNotification('u1', 'REMINDER', { taskContent: 'x' });
    expect(mockSendNotificationEmail).not.toHaveBeenCalled();
  });

  it('respects the email-off preference', async () => {
    const svc = await loadService();
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      emailEnabled: false,
      emailFrequency: 'immediate',
      disabledTypes: [],
    });
    await svc.sendEmailNotification('u1', 'REMINDER', { taskContent: 'x' });
    expect(mockSendNotificationEmail).not.toHaveBeenCalled();
  });

  it('defers non-urgent types to the digest unless frequency is immediate', async () => {
    const svc = await loadService();
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      emailEnabled: true,
      emailFrequency: 'daily',
      disabledTypes: [],
    });
    await svc.sendEmailNotification('u1', 'COMMENT_ON_TASK', { subject: 's', summary: 'b' });
    expect(mockSendNotificationEmail).not.toHaveBeenCalled();
  });

  it('sends immediately when the user chose immediate', async () => {
    const svc = await loadService();
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      emailEnabled: true,
      emailFrequency: 'immediate',
      disabledTypes: [],
    });
    await svc.sendEmailNotification('u1', 'COMMENT_ON_TASK', { subject: 'New comment', summary: 'hi' });
    expect(mockSendNotificationEmail).toHaveBeenCalledWith(
      'u@example.com',
      'User',
      'New comment',
      'hi',
    );
  });

  it('reminder emails always send regardless of digest frequency', async () => {
    const svc = await loadService();
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      emailEnabled: true,
      emailFrequency: 'weekly',
      disabledTypes: [],
    });
    await svc.sendEmailNotification('u1', 'REMINDER', { taskContent: 'Pay rent' });
    expect(mockSendNotificationEmail).toHaveBeenCalledWith(
      'u@example.com',
      'User',
      'Reminder: Pay rent',
      expect.stringContaining('Pay rent'),
    );
  });
});

describe('sendPushNotification', () => {
  it('is a no-op without VAPID keys', async () => {
    const svc = await loadService();
    await svc.sendPushNotification('u1', 't', 'b');
    expect(sendNotificationMock).not.toHaveBeenCalled();
    expect(mockPrisma.pushSubscription.findMany).not.toHaveBeenCalled();
  });

  it('delivers to every subscription when configured', async () => {
    envState.VAPID_PUBLIC_KEY = 'pub';
    envState.VAPID_PRIVATE_KEY = 'priv';
    const svc = await loadService();
    mockPrisma.pushSubscription.findMany.mockResolvedValue([
      { endpoint: 'https://push/1', p256dh: 'k1', auth: 'a1' },
      { endpoint: 'https://push/2', p256dh: 'k2', auth: 'a2' },
    ]);

    await svc.sendPushNotification('u1', 'Title', 'Body', { taskId: 't1' });
    expect(setVapidDetailsMock).toHaveBeenCalledOnce();
    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
    const [sub, payload] = sendNotificationMock.mock.calls[0];
    expect(sub.endpoint).toBe('https://push/1');
    expect(JSON.parse(payload)).toMatchObject({ title: 'Title', body: 'Body' });
  });

  it('prunes subscriptions the browser has revoked (410 Gone)', async () => {
    envState.VAPID_PUBLIC_KEY = 'pub';
    envState.VAPID_PRIVATE_KEY = 'priv';
    const svc = await loadService();
    mockPrisma.pushSubscription.findMany.mockResolvedValue([
      { endpoint: 'https://push/dead', p256dh: 'k', auth: 'a' },
    ]);
    sendNotificationMock.mockRejectedValueOnce(
      Object.assign(new Error('gone'), { statusCode: 410 }),
    );
    mockPrisma.pushSubscription.delete.mockResolvedValue({});

    await svc.sendPushNotification('u1', 't', 'b');
    expect(mockPrisma.pushSubscription.delete).toHaveBeenCalledWith({
      where: { endpoint: 'https://push/dead' },
    });
  });
});
