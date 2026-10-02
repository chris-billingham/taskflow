import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import { pruneHistory } from '../../services/retention.js';
import { dbFixtures } from './fixtures.js';

const fx = dbFixtures('retention');
const NOW = new Date('2026-10-02T03:30:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
let userId = '';

beforeAll(async () => {
  userId = (await fx.user('pat')).id;
});
afterAll(async () => {
  await fx.cleanup();
  await prisma.$disconnect();
});

async function activityAt(createdAt: Date) {
  return prisma.activityLog.create({
    data: { userId, action: 'CREATED', entityType: 'TASK', entityId: 'x', createdAt },
  });
}
async function notificationAt(createdAt: Date, isRead: boolean) {
  return prisma.notification.create({
    data: { userId, type: 'TASK_ASSIGNED', title: 't', body: 'b', isRead, createdAt },
  });
}
const exists = async (model: 'activityLog' | 'notification', id: string) =>
  (await (prisma[model] as unknown as { count: (a: object) => Promise<number> }).count({ where: { id } })) === 1;

describe('pruneHistory', () => {
  it('deletes activity past its retention and keeps the rest', async () => {
    const old = await activityAt(daysAgo(366));
    const recent = await activityAt(daysAgo(364));
    await pruneHistory(NOW, { activityDays: 365, notificationDays: 90 });
    expect(await exists('activityLog', old.id)).toBe(false);
    expect(await exists('activityLog', recent.id)).toBe(true);
  });

  it('deletes read notifications sooner than unread ones', async () => {
    const oldRead = await notificationAt(daysAgo(91), true);
    const oldUnread = await notificationAt(daysAgo(91), false);
    const ancientUnread = await notificationAt(daysAgo(361), false);
    const recentRead = await notificationAt(daysAgo(89), true);
    await pruneHistory(NOW, { activityDays: 365, notificationDays: 90 });
    expect(await exists('notification', oldRead.id)).toBe(false);
    expect(await exists('notification', oldUnread.id)).toBe(true);
    expect(await exists('notification', ancientUnread.id)).toBe(false);
    expect(await exists('notification', recentRead.id)).toBe(true);
  });

  it('keeps everything when retention is 0', async () => {
    const a = await activityAt(daysAgo(5000));
    const n = await notificationAt(daysAgo(5000), true);
    expect(await pruneHistory(NOW, { activityDays: 0, notificationDays: 0 })).toEqual({ activity: 0, notifications: 0 });
    expect(await exists('activityLog', a.id)).toBe(true);
    expect(await exists('notification', n.id)).toBe(true);
  });
});
