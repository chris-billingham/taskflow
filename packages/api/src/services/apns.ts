import http2 from 'node:http2';
import jwt from 'jsonwebtoken';
import type { ApnsEnvironment } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// Apple Push Notification service over HTTP/2, with token-based auth: each
// request carries a short JWT signed with the team's .p8 key. No library;
// node:http2 does the work.

const HOSTS: Record<ApnsEnvironment, string> = {
  PRODUCTION: 'https://api.push.apple.com',
  SANDBOX: 'https://api.sandbox.push.apple.com',
};

/** Apple's reasons for "this token will never work": drop the device. */
const DEAD_TOKEN_REASONS = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic', 'ExpiredToken']);

export function isApnsConfigured() {
  return Boolean(env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_PRIVATE_KEY && env.APNS_BUNDLE_ID);
}

let providerToken: { value: string; issuedAt: number } | null = null;

/** The provider JWT. Apple wants it renewed at least hourly and at most every 20 minutes. */
function authToken(): string {
  const now = Math.floor(Date.now() / 1000);
  if (!providerToken || now - providerToken.issuedAt > 50 * 60) {
    const key = env.APNS_PRIVATE_KEY!.replace(/\\n/g, '\n');
    providerToken = {
      issuedAt: now,
      value: jwt.sign({ iss: env.APNS_TEAM_ID, iat: now }, key, {
        algorithm: 'ES256',
        header: { alg: 'ES256', kid: env.APNS_KEY_ID! },
        noTimestamp: true,
      }),
    };
  }
  return providerToken.value;
}

const sessions = new Map<string, http2.ClientHttp2Session>();

function sessionFor(host: string) {
  const existing = sessions.get(host);
  if (existing && !existing.closed && !existing.destroyed) return existing;
  const session = http2.connect(host);
  session.on('error', (err) => logger.warn({ err, host }, 'APNs connection error'));
  session.on('close', () => sessions.delete(host));
  // Don't keep the process alive just for an idle push connection.
  session.unref();
  sessions.set(host, session);
  return session;
}

export interface ApnsResult {
  ok: boolean;
  /** The device token is permanently invalid and should be forgotten. */
  dead: boolean;
  status: number;
  reason?: string;
}

export function sendApns(
  deviceToken: string,
  environment: ApnsEnvironment,
  alert: { title: string; body: string },
  data: Record<string, unknown> = {},
): Promise<ApnsResult> {
  const host = env.APNS_HOST ?? HOSTS[environment];
  const body = JSON.stringify({ aps: { alert, sound: 'default' }, ...data });

  return new Promise((resolve, reject) => {
    const req = sessionFor(host).request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${authToken()}`,
      'apns-topic': env.APNS_BUNDLE_ID!,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    });
    let status = 0;
    let text = '';
    req.setEncoding('utf8');
    req.on('response', (headers) => {
      status = Number(headers[':status']);
    });
    req.on('data', (chunk: string) => {
      text += chunk;
    });
    req.on('end', () => {
      let reason: string | undefined;
      try {
        reason = text ? (JSON.parse(text) as { reason?: string }).reason : undefined;
      } catch {
        /* not JSON */
      }
      if (reason === 'ExpiredProviderToken') providerToken = null;
      resolve({ ok: status === 200, dead: status === 410 || DEAD_TOKEN_REASONS.has(reason ?? ''), status, reason });
    });
    req.on('error', reject);
    req.setTimeout(10_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
    req.end(body);
  });
}

/** For tests: forget the cached provider token and connections. */
export function resetApns() {
  providerToken = null;
  for (const s of sessions.values()) s.close();
  sessions.clear();
}
