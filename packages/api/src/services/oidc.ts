import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import * as client from 'openid-client';
import { prisma } from '../config/database.js';
import { env, isBootstrapAdminEmail, isOidcConfigured, publicAppUrl } from '../config/env.js';
import { logger } from '../config/logger.js';
import { hashPassword } from '../utils/password.js';
import { canRegister } from './instanceSettingsService.js';
import { provisionUser } from './userService.js';

/**
 * Single sign-on with an OpenID Connect provider: the authorization code
 * flow with PKCE, state and nonce. Accounts are matched by the provider's
 * subject, then by verified email; new ones follow the sign-up policy.
 */

const PROVIDER = 'oidc';
/** How long someone has at the provider before the sign-in is abandoned. */
export const PENDING_TTL_S = 10 * 60;

/** Why single sign-on didn't produce an account, as the login page explains it. */
export type SsoFailure = 'not_configured' | 'expired' | 'failed' | 'no_email' | 'email_unverified' | 'not_invited' | 'suspended';

export class SsoError extends Error {
  constructor(public readonly reason: SsoFailure, detail?: string) {
    super(detail ?? reason);
  }
}

let discovered: Promise<client.Configuration> | null = null;

/** The provider's configuration, discovered once (and again after a failure). */
function configuration(): Promise<client.Configuration> {
  if (!isOidcConfigured()) return Promise.reject(new SsoError('not_configured'));
  if (!discovered) {
    const issuer = new URL(env.OIDC_ISSUER!);
    discovered = client
      .discovery(
        issuer,
        env.OIDC_CLIENT_ID!,
        undefined,
        // HTTP Basic: the default every provider must accept (RFC 6749 2.3.1).
        client.ClientSecretBasic(env.OIDC_CLIENT_SECRET!),
        // A provider on the internal network may be plain http.
        issuer.protocol === 'http:' ? { execute: [client.allowInsecureRequests] } : undefined,
      )
      .catch((err) => {
        discovered = null;
        throw err;
      });
  }
  return discovered;
}

/** Tests: forget the discovered configuration. */
export function resetOidc(): void {
  discovered = null;
}

export const redirectUri = () => `${publicAppUrl()}/api/v1/auth/oidc/callback`;

interface PendingLogin {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirect: string;
}

// The pending sign-in rides in a cookie, signed with a key of its own.
const pendingKey = () => `${env.JWT_SECRET}:oidc-login`;

/** Where to send the browser, and the cookie value that must come back with it. */
export async function startLogin(redirect: string): Promise<{ url: string; pending: string }> {
  const config = await configuration();
  const login: PendingLogin = {
    state: client.randomState(),
    nonce: client.randomNonce(),
    codeVerifier: client.randomPKCECodeVerifier(),
    redirect,
  };
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri(),
    scope: env.OIDC_SCOPES,
    state: login.state,
    nonce: login.nonce,
    code_challenge: await client.calculatePKCECodeChallenge(login.codeVerifier),
    code_challenge_method: 'S256',
  });
  const pending = jwt.sign(login, pendingKey(), { expiresIn: PENDING_TTL_S, algorithm: 'HS256' });
  return { url: url.href, pending };
}

export function readPending(cookie: string | undefined): PendingLogin | null {
  if (!cookie) return null;
  try {
    return jwt.verify(cookie, pendingKey(), { algorithms: ['HS256'] }) as PendingLogin;
  } catch {
    return null;
  }
}

interface Claims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
}

/** Exchange the code from the callback URL for the person's verified claims. */
export async function finishLogin(callbackUrl: URL, pending: PendingLogin): Promise<Claims> {
  const config = await configuration();
  let tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>;
  try {
    tokens = await client.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: pending.codeVerifier,
      expectedState: pending.state,
      expectedNonce: pending.nonce,
      idTokenExpected: true,
    });
  } catch (err) {
    logger.warn({ err }, 'single sign-on: the provider refused or the response was invalid');
    throw new SsoError('failed');
  }
  let claims = tokens.claims() as Claims | undefined;
  if (!claims) throw new SsoError('failed');
  // Some providers put the email only in userinfo.
  if (!claims.email) {
    claims = { ...((await client.fetchUserInfo(config, tokens.access_token, claims.sub)) as Claims), sub: claims.sub };
  }
  return claims;
}

/** The Taskflow account for these claims: linked, matched by email, or new. */
export async function resolveUser(claims: Claims) {
  const identity = await prisma.externalIdentity.findUnique({
    where: { provider_subject: { provider: PROVIDER, subject: claims.sub } },
    include: { user: true },
  });
  if (identity) {
    await prisma.externalIdentity.update({
      where: { id: identity.id },
      data: { lastUsedAt: new Date(), email: claims.email ?? identity.email },
    });
    return identity.user;
  }

  const email = claims.email?.trim().toLowerCase();
  if (!email) throw new SsoError('no_email');
  const verified = claims.email_verified === true || (claims.email_verified === undefined && env.OIDC_TRUST_EMAIL === 'true');
  // Linking by an address the provider hasn't verified would hand over any
  // account whose address someone can type into their provider profile.
  if (!verified) throw new SsoError('email_unverified');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.externalIdentity.create({
      data: { userId: existing.id, provider: PROVIDER, subject: claims.sub, email, lastUsedAt: new Date() },
    });
    logger.info({ userId: existing.id }, 'single sign-on linked to an existing account');
    return existing;
  }

  if (!(await canRegister(email))) throw new SsoError('not_invited');

  const name = claims.name?.trim() || claims.preferred_username?.trim() || email.split('@')[0];
  // A random password nobody knows; passwordSet false lets them choose one.
  const passwordHash = await hashPassword(randomBytes(32).toString('base64url'));
  const user = await prisma.$transaction(async (tx) => {
    const created = await provisionUser(tx, {
      email,
      passwordHash,
      passwordSet: false,
      name: name.slice(0, 100),
      emailVerified: true,
      role: isBootstrapAdminEmail(email) ? 'ADMIN' : undefined,
    });
    await tx.externalIdentity.create({
      data: { userId: created.id, provider: PROVIDER, subject: claims.sub, email, lastUsedAt: new Date() },
    });
    return created;
  });
  logger.info({ userId: user.id }, 'account created through single sign-on');
  return prisma.user.findUniqueOrThrow({ where: { id: user.id } });
}
