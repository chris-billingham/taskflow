import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { buildTestApp } from '../integration/buildTestApp.js';
import { resetOidc } from '../../services/oidc.js';
import { setRegistrationMode } from '../../services/instanceSettingsService.js';
import { dbFixtures } from './fixtures.js';

// Single sign-on against a fake OpenID Connect provider: discovery, JWKS,
// and a token endpoint that checks PKCE and signs ID tokens.
const fx = dbFixtures('sso');
let app: FastifyInstance;
let idp: Server;
let issuer = '';
let privateKey: CryptoKey;
const CLIENT = { id: 'taskflow', secret: 'idp-client-secret' };
const issued = new Map<string, { nonce: string; challenge: string; claims: Record<string, unknown> }>();
const savedEnv = { ...env };

beforeAll(async () => {
  const keys = await generateKeyPair('RS256');
  privateKey = keys.privateKey;
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };

  idp = createServer(async (req, res) => {
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const url = new URL(req.url!, issuer);
    if (url.pathname === '/.well-known/openid-configuration') {
      return json(200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic'],
      });
    }
    if (url.pathname === '/jwks') return json(200, { keys: [jwk] });
    if (url.pathname === '/token' && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = new URLSearchParams(raw);
      // RFC 6749 2.3.1: both halves are form-encoded before base64.
      const [id, secret] = Buffer.from((req.headers.authorization ?? '').replace(/^Basic /, ''), 'base64')
        .toString()
        .split(':')
        .map((part) => decodeURIComponent(part.replace(/\+/g, ' ')));
      const grant = issued.get(body.get('code') ?? '');
      issued.delete(body.get('code') ?? '');
      const challenge = createHash('sha256').update(body.get('code_verifier') ?? '').digest('base64url');
      if (id !== CLIENT.id || secret !== CLIENT.secret || !grant || grant.challenge !== challenge) {
        return json(400, { error: 'invalid_grant' });
      }
      const idToken = await new SignJWT({ nonce: grant.nonce, ...grant.claims })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(issuer)
        .setAudience(CLIENT.id)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
      return json(200, { access_token: 'at', token_type: 'Bearer', expires_in: 300, id_token: idToken });
    }
    json(404, {});
  });
  await new Promise<void>((resolve) => idp.listen(0, '127.0.0.1', resolve));
  issuer = `http://127.0.0.1:${(idp.address() as AddressInfo).port}`;

  Object.assign(env, {
    OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: CLIENT.id,
    OIDC_CLIENT_SECRET: CLIENT.secret,
    OIDC_NAME: 'Authentik',
    APP_URL: 'https://tasks.example.com',
  });
  resetOidc();
  app = await buildTestApp();
  await app.ready();
});
afterEach(() => {
  env.OIDC_TRUST_EMAIL = savedEnv.OIDC_TRUST_EMAIL;
});
afterAll(async () => {
  Object.assign(env, savedEnv);
  resetOidc();
  await prisma.externalIdentity.deleteMany({ where: { email: { endsWith: `@${fx.run}.sso.test` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${fx.run}.sso.test` } } });
  await app.close();
  await fx.cleanup();
  await new Promise((resolve) => idp.close(resolve));
  await prisma.$disconnect();
});

const address = (name: string) => `${name}@${fx.run}.sso.test`;
const cookieValue = (setCookie: string | string[] | undefined, name: string) =>
  ([] as string[]).concat(setCookie ?? []).find((c) => c.startsWith(`${name}=`))?.split(';')[0].slice(name.length + 1);

/** Go through the whole sign-in as someone the provider vouches for. */
async function signInAs(claims: Record<string, unknown>, redirect = '/projects/abc', tamper?: { state?: string; noCookie?: boolean }) {
  const start = await app.inject({ method: 'GET', url: `/api/v1/auth/oidc/start?redirect=${encodeURIComponent(redirect)}` });
  expect(start.statusCode).toBe(302);
  const authorize = new URL(start.headers.location as string);
  expect(authorize.origin + authorize.pathname).toBe(`${issuer}/authorize`);
  expect(authorize.searchParams.get('redirect_uri')).toBe('https://tasks.example.com/api/v1/auth/oidc/callback');
  const pending = cookieValue(start.headers['set-cookie'], 'oidcLogin');

  // The person signs in at the provider, which sends them back with a code.
  const code = randomUUID();
  issued.set(code, {
    nonce: authorize.searchParams.get('nonce')!,
    challenge: authorize.searchParams.get('code_challenge')!,
    claims,
  });
  const state = tamper?.state ?? authorize.searchParams.get('state')!;
  const callback = await app.inject({
    method: 'GET',
    url: `/api/v1/auth/oidc/callback?code=${code}&state=${state}`,
    cookies: tamper?.noCookie || !pending ? {} : { oidcLogin: pending },
  });
  expect(callback.statusCode).toBe(302);
  return { location: callback.headers.location as string, refresh: cookieValue(callback.headers['set-cookie'], 'refreshToken') };
}

/** The account a refresh cookie signs in as. */
async function whoIs(refresh: string | undefined) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', cookies: { refreshToken: refresh! } });
  const me = await app.inject({
    method: 'GET',
    url: '/api/v1/users/me',
    headers: { authorization: `Bearer ${res.json().data.accessToken}` },
  });
  return me.json().data as { id: string; email: string };
}

describe('single sign-on', () => {
  it('says it is available, and under what name', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/sso' });
    expect(res.json().data).toEqual({ enabled: true, name: 'Authentik' });
  });

  it('creates an account for someone new, then signs them in to the same one by subject', async () => {
    const sub = randomUUID();
    const first = await signInAs({ sub, email: address('new'), email_verified: true, name: 'New Person' });
    expect(first.location).toBe('/projects/abc');
    const user = await whoIs(first.refresh);
    expect(user.email).toBe(address('new'));
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ name: 'New Person', emailVerified: true, passwordSet: false });

    // Their address changed at the provider; the subject didn't.
    const again = await signInAs({ sub, email: address('renamed'), email_verified: true });
    expect((await whoIs(again.refresh)).id).toBe(user.id);
  });

  it('links an existing account by verified email', async () => {
    const existing = await prisma.user.create({
      data: { email: address('existing'), passwordHash: 'x', name: 'Existing', emailVerified: true },
    });
    const { refresh } = await signInAs({ sub: randomUUID(), email: address('existing'), email_verified: true });
    expect((await whoIs(refresh)).id).toBe(existing.id);
  });

  it('won’t link by an address the provider hasn’t verified', async () => {
    const { location } = await signInAs({ sub: randomUUID(), email: address('existing'), email_verified: false });
    expect(location).toBe('/login?sso_error=email_unverified&redirect=%2Fprojects%2Fabc');
    // No claim at all counts as unverified unless OIDC_TRUST_EMAIL says otherwise.
    expect((await signInAs({ sub: randomUUID(), email: address('nobody') })).location).toMatch(/sso_error=email_unverified/);
    env.OIDC_TRUST_EMAIL = 'true';
    expect((await signInAs({ sub: randomUUID(), email: address('trusted') })).location).toBe('/projects/abc');
  });

  it('follows the sign-up policy for new accounts', async () => {
    const admin = await fx.user('policy-admin');
    await setRegistrationMode('invite', admin.id);
    try {
      const { location } = await signInAs({ sub: randomUUID(), email: address('stranger'), email_verified: true });
      expect(location).toMatch(/^\/login\?sso_error=not_invited/);
    } finally {
      await setRegistrationMode('open', admin.id);
    }
  });

  it('still asks for the second factor when the account has one', async () => {
    const sub = randomUUID();
    const first = await signInAs({ sub, email: address('twofa'), email_verified: true });
    const user = await whoIs(first.refresh);
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: 'JBSWY3DPEHPK3PXP', twoFactorEnabledAt: new Date() } });
    const { location, refresh } = await signInAs({ sub, email: address('twofa'), email_verified: true });
    expect(location).toMatch(/^\/login\?redirect=%2Fprojects%2Fabc#two-factor=.+/);
    expect(refresh).toBeUndefined();
  });

  it('refuses a callback whose state doesn’t match, or with no sign-in in progress', async () => {
    expect((await signInAs({ sub: randomUUID(), email: address('x'), email_verified: true }, '/today', { state: 'forged' })).location)
      .toMatch(/^\/login\?sso_error=failed/);
    expect((await signInAs({ sub: randomUUID(), email: address('y'), email_verified: true }, '/today', { noCookie: true })).location)
      .toBe('/login?sso_error=expired');
  });

  it('only redirects within the site', async () => {
    const { location } = await signInAs({ sub: randomUUID(), email: address('redirect'), email_verified: true }, '//evil.example');
    expect(location).toBe('/today');
  });

  it('lets a new single sign-on account choose its first password, without a current one', async () => {
    const { refresh } = await signInAs({ sub: randomUUID(), email: address('setpw'), email_verified: true });
    const access = (await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', cookies: { refreshToken: refresh! } })).json().data.accessToken;
    const headers = { authorization: `Bearer ${access}` };

    // Actions that confirm a password explain what to do first.
    const setup = await app.inject({ method: 'POST', url: '/api/v1/auth/two-factor/setup', headers, payload: { password: 'anything' } });
    expect(setup.statusCode).toBe(403);
    expect(setup.json().error).toBe('PASSWORD_NOT_SET');

    const set = await app.inject({ method: 'PATCH', url: '/api/v1/users/me/password', headers, payload: { newPassword: 'a-brand-new-password' } });
    expect(set.statusCode).toBe(200);
    const me = await prisma.user.findUniqueOrThrow({ where: { email: address('setpw') } });
    expect(me.passwordSet).toBe(true);
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: address('setpw'), password: 'a-brand-new-password' } });
    expect(login.json().data.accessToken).toEqual(expect.any(String));
  });
});
