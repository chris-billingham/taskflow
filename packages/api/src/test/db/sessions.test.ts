import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import { buildTestApp } from '../integration/buildTestApp.js';
import { hashPassword } from '../../utils/password.js';
import { dbFixtures } from './fixtures.js';
import type { FastifyInstance } from 'fastify';

// The real app against the real database: sign-in for apps, sessions and
// personal access tokens, end to end over HTTP.
const fx = dbFixtures('sessions');
let app: FastifyInstance;
let email = '';
const PASSWORD = 'correct horse battery';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
  const user = await fx.user('pat');
  email = user.email;
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(PASSWORD) } });
  await prisma.project.create({ data: { name: 'Inbox', ownerId: user.id, isInbox: true } });
});
afterAll(async () => {
  await app.close();
  await fx.cleanup();
  await prisma.$disconnect();
});

const login = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: PASSWORD, ...body }, headers });
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('sign-in for apps', () => {
  it('an app gets its refresh token in the body, not a cookie, and can rotate it', async () => {
    const res = await login({ client: 'app', deviceName: 'Pat’s iPhone' });
    expect(res.statusCode).toBe(200);
    const { accessToken, refreshToken } = res.json().data;
    expect(refreshToken).toEqual(expect.any(String));
    expect(res.headers['set-cookie']).toBeUndefined();

    const refreshed = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().data.refreshToken).not.toBe(refreshToken);
    // The old one is spent.
    const replay = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } });
    expect(replay.statusCode).toBe(401);
    expect(accessToken).toBeTruthy();
  });

  it('the web keeps using the cookie', async () => {
    const res = await login({});
    expect(res.json().data.refreshToken).toBeUndefined();
    expect(String(res.headers['set-cookie'])).toMatch(/refreshToken=/);
  });
});

describe('sessions', () => {
  it('lists each device once, keeps its name across refreshes, and marks this one', async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { email } } });
    const phone = (await login({ client: 'app', deviceName: 'Pat’s iPhone' })).json().data;
    const web = (await login({}, { 'user-agent': IPHONE_UA })).json().data;
    await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: phone.refreshToken } });

    const list = (await app.inject({ method: 'GET', url: '/api/v1/sessions', headers: bearer(web.accessToken) })).json().data;
    expect(list.map((s: { name: string; client: string; current: boolean }) => [s.name, s.client, s.current])).toEqual([
      ['Safari on iPhone', 'WEB', true],
      ['Pat’s iPhone', 'APP', false],
    ]);
  });

  it('signing a device out ends that session only', async () => {
    const list = await prisma.refreshToken.findMany({ where: { user: { email } } });
    const phone = list.find((r) => r.client === 'APP')!;
    const web = (await login({})).json().data;

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/sessions/${phone.sessionId}`, headers: bearer(web.accessToken) });
    expect(res.statusCode).toBe(200);
    expect(await prisma.refreshToken.count({ where: { sessionId: phone.sessionId } })).toBe(0);

    await app.inject({ method: 'DELETE', url: '/api/v1/sessions', headers: bearer(web.accessToken) });
    const left = await prisma.refreshToken.findMany({ where: { user: { email } } });
    expect(left).toHaveLength(1);
  });
});

describe('personal access tokens', () => {
  let session = '';
  beforeAll(async () => {
    session = (await login({})).json().data.accessToken;
  });

  const mint = async (scope: 'READ' | 'WRITE') =>
    (await app.inject({ method: 'POST', url: '/api/v1/tokens', headers: bearer(session), payload: { name: `script ${scope}`, scope } })).json().data;

  it('is shown once, then listed by prefix only', async () => {
    const created = await mint('WRITE');
    expect(created.token).toMatch(/^tfp_/);
    expect(created.prefix).toBe(created.token.slice(0, 8));
    const list = (await app.inject({ method: 'GET', url: '/api/v1/tokens', headers: bearer(session) })).json().data;
    expect(list[0]).not.toHaveProperty('token');
  });

  it('a WRITE token works on the API like a session', async () => {
    const { token } = await mint('WRITE');
    const res = await app.inject({ method: 'POST', url: '/api/v1/tasks/quick-add', headers: bearer(token), payload: { text: 'From a script' } });
    expect(res.statusCode).toBe(201);
    expect((await prisma.apiToken.findFirstOrThrow({ where: { prefix: token.slice(0, 8) } })).lastUsedAt).not.toBeNull();
  });

  it('a READ token can read but not change anything', async () => {
    const { token } = await mint('READ');
    expect((await app.inject({ method: 'GET', url: '/api/v1/projects', headers: bearer(token) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/v1/tasks/quick-add', headers: bearer(token), payload: { text: 'nope' } })).statusCode).toBe(403);
  });

  it('cannot manage the account: tokens, sessions, password, deletion', async () => {
    const { token } = await mint('WRITE');
    for (const [method, url] of [
      ['GET', '/api/v1/tokens'],
      ['GET', '/api/v1/sessions'],
      ['PATCH', '/api/v1/users/me/password'],
      ['DELETE', '/api/v1/settings/data'],
    ] as const) {
      const res = await app.inject({ method, url, headers: bearer(token), payload: method === 'GET' ? undefined : { password: PASSWORD, currentPassword: PASSWORD, newPassword: 'another long one' } });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('stops working once revoked or expired', async () => {
    const created = await mint('WRITE');
    await app.inject({ method: 'DELETE', url: `/api/v1/tokens/${created.id}`, headers: bearer(session) });
    expect((await app.inject({ method: 'GET', url: '/api/v1/projects', headers: bearer(created.token) })).statusCode).toBe(401);

    const old = await mint('READ');
    await prisma.apiToken.update({ where: { id: old.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await app.inject({ method: 'GET', url: '/api/v1/projects', headers: bearer(old.token) })).statusCode).toBe(401);
  });
});

describe('deleting your account', () => {
  it('needs your password, and a wrong one is a 403, not a signed-out 401', async () => {
    const session = (await login({})).json().data.accessToken;
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/settings/data', headers: bearer(session), payload: { password: 'wrong' } });
    expect(res.statusCode).toBe(403);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });
});

describe('refresh token reuse', () => {
  it('a copied token used after its rotation ends that session, and only that one', async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { email } } });
    const phone = (await login({ client: 'app', deviceName: 'Phone' })).json().data;
    const laptop = (await login({ client: 'app', deviceName: 'Laptop' })).json().data;

    const rotated = (await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: phone.refreshToken } })).json().data;
    // Pretend the exchange was a while ago, beyond the grace for racing tabs.
    await prisma.refreshToken.updateMany({ where: { usedAt: { not: null } }, data: { usedAt: new Date(Date.now() - 60_000) } });

    const replay = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: phone.refreshToken } });
    expect(replay.statusCode).toBe(401);
    // The phone's session is over, the rotated token included...
    const afterReplay = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: rotated.refreshToken } });
    expect(afterReplay.statusCode).toBe(401);
    // ...and the laptop is untouched.
    const laptopRefresh = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: laptop.refreshToken } });
    expect(laptopRefresh.statusCode).toBe(200);
  });

  it('two refreshes at once with the same token don’t end the session', async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { email } } });
    const tab = (await login({ client: 'app' })).json().data;
    const first = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: tab.refreshToken } });
    const second = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: tab.refreshToken } });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(401);
    const next = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: first.json().data.refreshToken } });
    expect(next.statusCode).toBe(200);
  });

  it('a device signed out from another device is simply refused', async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { email } } });
    const old = (await login({ client: 'app', deviceName: 'Old tablet' })).json().data;
    const current = (await login({ client: 'app', deviceName: 'Phone' })).json().data;
    const sessions = (await app.inject({ method: 'GET', url: '/api/v1/sessions', headers: bearer(current.accessToken) })).json().data;
    const tablet = sessions.find((s: { name: string }) => s.name === 'Old tablet');
    await app.inject({ method: 'DELETE', url: `/api/v1/sessions/${tablet.id}`, headers: bearer(current.accessToken) });

    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: old.refreshToken } });
    expect(res.statusCode).toBe(401);
    const stillIn = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: current.refreshToken } });
    expect(stillIn.statusCode).toBe(200);
  });
});
