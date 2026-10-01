import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

const sent = vi.hoisted(() => [] as string[]);
vi.mock('../../services/apns.js', () => ({
  isApnsConfigured: () => true,
  sendApns: vi.fn(async (token: string) => {
    sent.push(token);
    return token.startsWith('dead') ? { ok: false, dead: true, status: 410 } : { ok: true, dead: false, status: 200 };
  }),
}));

import { prisma } from '../../config/database.js';
import { buildTestApp } from '../integration/buildTestApp.js';
import { hashPassword } from '../../utils/password.js';
import { sendPushNotification } from '../../services/notificationService.js';
import { dbFixtures } from './fixtures.js';

const fx = dbFixtures('appledevices');
let app: FastifyInstance;
let userId = '';
let email = '';
const PASSWORD = 'a long enough password';
const hex = (c: string) => c.repeat(64);

const signIn = async (deviceName: string) =>
  (
    await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: PASSWORD, client: 'app', deviceName } })
  ).json().data as { accessToken: string; refreshToken: string };
const register = (accessToken: string, token: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/push/apple',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { token, environment: 'SANDBOX' },
  });

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
  const user = await fx.user('ios');
  userId = user.id;
  email = user.email;
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(PASSWORD) } });
});
afterAll(async () => {
  await app.close();
  await fx.cleanup();
  await prisma.$disconnect();
});

describe('Apple push devices', () => {
  it('an app registers its token, tied to its session, and gets pushes', async () => {
    const phone = await signIn('Phone');
    expect((await register(phone.accessToken, hex('a'))).statusCode).toBe(200);
    const device = await prisma.appleDevice.findUniqueOrThrow({ where: { token: hex('a') } });
    expect(device.sessionId).toEqual(expect.any(String));

    sent.length = 0;
    await sendPushNotification(userId, 'Hi', 'There');
    expect(sent).toEqual([hex('a')]);
  });

  it('signing the device out stops its pushes and forgets it', async () => {
    const tablet = await signIn('Tablet');
    await register(tablet.accessToken, hex('b'));
    await app.inject({ method: 'POST', url: '/api/v1/auth/logout', payload: { refreshToken: tablet.refreshToken } });

    sent.length = 0;
    await sendPushNotification(userId, 'Hi', 'There');
    expect(sent).not.toContain(hex('b'));
    expect(await prisma.appleDevice.count({ where: { token: hex('b') } })).toBe(0);
  });

  it('a token Apple rejects is dropped', async () => {
    const phone = await signIn('Old phone');
    const dead = 'dead' + 'f'.repeat(60);
    await register(phone.accessToken, dead);
    await sendPushNotification(userId, 'Hi', 'There');
    expect(await prisma.appleDevice.count({ where: { token: dead } })).toBe(0);
  });

  it('refuses a non-hex token', async () => {
    const phone = await signIn('Phone 2');
    expect((await register(phone.accessToken, 'not-a-token')).statusCode).toBe(400);
  });
});
