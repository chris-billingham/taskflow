import crypto from 'node:crypto';
import { prisma } from '../config/database.js';
import { NotFoundError } from '../errors/index.js';
import { disconnectSessionSockets } from '../websocket/events.js';
import type { CreateApiTokenInput } from '@taskflow/contract';

// ── Sessions ─────────────────────────────────────────────────────────────────
// One per signed-in device: the live refresh token for that session id.

export async function listSessions(userId: string, currentSessionId: string | undefined) {
  const rows = await prisma.refreshToken.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  // Rotation leaves one row per session; keep the newest if a race left two.
  const seen = new Set<string>();
  return rows
    .filter((r) => !seen.has(r.sessionId) && seen.add(r.sessionId))
    .map((r) => ({
      id: r.sessionId,
      name: r.name ?? 'Unknown device',
      client: r.client,
      startedAt: r.sessionStartedAt,
      lastUsedAt: r.lastUsedAt,
      current: r.sessionId === currentSessionId,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current) || b.lastUsedAt.getTime() - a.lastUsedAt.getTime());
}

/** Sign one device out: its refresh token goes and its live sockets drop. */
export async function revokeSession(userId: string, sessionId: string) {
  const { count } = await prisma.refreshToken.deleteMany({ where: { userId, sessionId } });
  if (count === 0) throw new NotFoundError('Session not found');
  disconnectSessionSockets(sessionId);
  return { message: 'Signed out of that device' };
}

/** Sign out everywhere except here. */
export async function revokeOtherSessions(userId: string, currentSessionId: string | undefined) {
  const others = await prisma.refreshToken.findMany({
    where: { userId, ...(currentSessionId && { sessionId: { not: currentSessionId } }) },
    select: { sessionId: true },
  });
  await prisma.refreshToken.deleteMany({
    where: { userId, ...(currentSessionId && { sessionId: { not: currentSessionId } }) },
  });
  for (const sid of new Set(others.map((o) => o.sessionId))) disconnectSessionSockets(sid);
  return { message: 'Signed out of your other devices' };
}

// ── Personal access tokens ───────────────────────────────────────────────────

export const API_TOKEN_PREFIX = 'tfp_';

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const tokenFields = {
  id: true,
  name: true,
  prefix: true,
  scope: true,
  lastUsedAt: true,
  expiresAt: true,
  createdAt: true,
} as const;

export async function listApiTokens(userId: string) {
  return prisma.apiToken.findMany({ where: { userId }, select: tokenFields, orderBy: { createdAt: 'desc' } });
}

export async function createApiToken(userId: string, input: CreateApiTokenInput) {
  const token = API_TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
  const created = await prisma.apiToken.create({
    data: {
      userId,
      name: input.name,
      scope: input.scope,
      tokenHash: sha256(token),
      prefix: token.slice(0, API_TOKEN_PREFIX.length + 4),
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
    },
    select: tokenFields,
  });
  // The only time the token itself leaves the server.
  return { ...created, token };
}

export async function revokeApiToken(userId: string, id: string) {
  const { count } = await prisma.apiToken.deleteMany({ where: { id, userId } });
  if (count === 0) throw new NotFoundError('Token not found');
  return { message: 'Token revoked' };
}

/**
 * Who a personal access token belongs to, or null if it's unknown, expired,
 * or its account is suspended. Records when it was last used (at most once
 * a minute, so busy scripts don't write on every request).
 */
export async function resolveApiToken(token: string) {
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, email: true, name: true, isActive: true } } },
  });
  if (!row || !row.user.isActive) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;
  const minuteAgo = new Date(Date.now() - 60_000);
  if (!row.lastUsedAt || row.lastUsedAt < minuteAgo) {
    await prisma.apiToken.updateMany({
      where: { id: row.id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: minuteAgo } }] },
      data: { lastUsedAt: new Date() },
    });
  }
  return { tokenId: row.id, scope: row.scope, user: row.user };
}
