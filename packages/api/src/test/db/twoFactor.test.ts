import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../config/database.js';
import { getRedis } from '../../config/redis.js';
import { buildTestApp } from '../integration/buildTestApp.js';
import { hashPassword } from '../../utils/password.js';
import { generateAccessToken } from '../../utils/jwt.js';
import { currentCode } from '../../services/twoFactor.js';
import { dbFixtures } from './fixtures.js';

// Two-factor sign-in end to end over HTTP: setting it up, signing in with a
// code or a recovery code, and turning it off.
const fx = dbFixtures('twofactor');
let app: FastifyInstance;
let user: { id: string; email: string; name: string };
let headers: Record<string, string>;
let secret = '';
let recoveryCodes: string[] = [];
const PASSWORD = 'correct horse battery';
const STEP_MS = 30_000;

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
  user = await fx.user('sam');
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(PASSWORD) } });
  await prisma.project.create({ data: { name: 'Inbox', ownerId: user.id, isInbox: true } });
  headers = { authorization: `Bearer ${generateAccessToken({ id: user.id, email: user.email, name: user.name })}` };
});
afterAll(async () => {
  await getRedis().del(`two-factor:failures:${user.id}`);
  await app.close();
  await fx.cleanup();
  await prisma.$disconnect();
});

const post = (url: string, payload: object, h: Record<string, string> = headers) =>
  app.inject({ method: 'POST', url, payload, headers: h });
const login = () => post('/api/v1/auth/login', { email: user.email, password: PASSWORD, client: 'app' }, {});
const secondStep = (body: object) => post('/api/v1/auth/login/two-factor', { client: 'app', ...body }, {});
// A code from a later 30-second step, so each sign-in has one not used before.
let offset = 0;
const freshCode = () => currentCode(secret, user.email, Date.now() + (offset = offset === 0 ? STEP_MS : 0));

describe('setting up', () => {
  it('asks for the password, then returns a secret and a QR code', async () => {
    expect((await post('/api/v1/auth/two-factor/setup', { password: 'wrong' })).statusCode).toBe(403);
    const res = await post('/api/v1/auth/two-factor/setup', { password: PASSWORD });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.qrCode).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(data.otpauthUrl).toContain(`secret=${data.secret}`);
    secret = data.secret;
  });

  it('turns on only with a correct code, and returns ten recovery codes once', async () => {
    const wrong = await post('/api/v1/auth/two-factor/enable', { code: '000000' });
    expect(wrong.statusCode).toBe(400);
    const res = await post('/api/v1/auth/two-factor/enable', { code: currentCode(secret, user.email) });
    expect(res.statusCode).toBe(200);
    recoveryCodes = res.json().data.recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);
    expect(recoveryCodes[0]).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);

    const status = await app.inject({ method: 'GET', url: '/api/v1/auth/two-factor', headers });
    expect(status.json().data).toMatchObject({ enabled: true, recoveryCodesLeft: 10 });
  });
});

describe('signing in', () => {
  it('asks for a second factor after the password, with no session yet', async () => {
    const res = await login();
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toEqual({ twoFactorRequired: true, challengeToken: expect.any(String) });
    // The challenge is no use as an access token.
    const me = await app.inject({ method: 'GET', url: '/api/v1/users/me', headers: { authorization: `Bearer ${data.challengeToken}` } });
    expect(me.statusCode).toBe(401);
  });

  it('signs in with a code, which then can’t be used again', async () => {
    const code = freshCode();
    const { challengeToken } = (await login()).json().data;
    const res = await secondStep({ challengeToken, code });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ user: { id: user.id }, accessToken: expect.any(String), refreshToken: expect.any(String) });

    const replay = await secondStep({ challengeToken: (await login()).json().data.challengeToken, code });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error).toBe('INVALID_TWO_FACTOR_CODE');
  });

  it('signs in once with each recovery code', async () => {
    const recoveryCode = recoveryCodes[0].toUpperCase(); // case and dashes don't matter
    const first = await secondStep({ challengeToken: (await login()).json().data.challengeToken, recoveryCode });
    expect(first.statusCode).toBe(200);
    const again = await secondStep({ challengeToken: (await login()).json().data.challengeToken, recoveryCode });
    expect(again.statusCode).toBe(401);
    const status = await app.inject({ method: 'GET', url: '/api/v1/auth/two-factor', headers });
    expect(status.json().data.recoveryCodesLeft).toBe(9);
  });

  it('refuses a forged or expired challenge', async () => {
    const res = await secondStep({ challengeToken: 'not-a-token', code: '123456' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('CHALLENGE_EXPIRED');
  });

  it('needs exactly one of a code or a recovery code', async () => {
    const { challengeToken } = (await login()).json().data;
    expect((await secondStep({ challengeToken })).statusCode).toBe(400);
  });

  it('stops guessing after ten wrong codes for the account', async () => {
    const redis = getRedis();
    await redis.set(`two-factor:failures:${user.id}`, '10');
    const res = await secondStep({ challengeToken: (await login()).json().data.challengeToken, code: freshCode() });
    expect(res.statusCode).toBe(429);
    await redis.del(`two-factor:failures:${user.id}`);
  });
});

describe('managing it', () => {
  it('replaces the recovery codes', async () => {
    const res = await post('/api/v1/auth/two-factor/recovery-codes', { password: PASSWORD });
    expect(res.statusCode).toBe(200);
    const fresh = res.json().data.recoveryCodes;
    expect(fresh).toHaveLength(10);
    // An old one no longer works.
    const old = await secondStep({ challengeToken: (await login()).json().data.challengeToken, recoveryCode: recoveryCodes[1] });
    expect(old.statusCode).toBe(401);
    recoveryCodes = fresh;
  });

  it('turns off only with the password and a current code', async () => {
    expect((await post('/api/v1/auth/two-factor/disable', { password: PASSWORD, code: '000000' })).statusCode).toBe(403);
    expect((await post('/api/v1/auth/two-factor/disable', { password: 'wrong', code: freshCode() })).statusCode).toBe(403);
    const res = await post('/api/v1/auth/two-factor/disable', { password: PASSWORD, recoveryCode: recoveryCodes[0] });
    expect(res.statusCode).toBe(200);
    const signedIn = (await login()).json().data;
    expect(signedIn.accessToken).toEqual(expect.any(String));
  });

  it('an admin can turn it off for someone who lost their phone', async () => {
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret, twoFactorEnabledAt: new Date() } });
    const admin = await fx.user('admin');
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    const adminHeaders = { authorization: `Bearer ${generateAccessToken({ id: admin.id, email: admin.email, name: admin.name })}` };

    const list = await app.inject({ method: 'GET', url: `/api/v1/admin/users?search=${user.email}`, headers: adminHeaders });
    expect(list.json().data.users[0].twoFactorEnabledAt).toEqual(expect.any(String));

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/admin/users/${user.id}/two-factor`, headers: adminHeaders });
    expect(res.statusCode).toBe(200);
    expect((await login()).json().data.accessToken).toEqual(expect.any(String));
  });
});
