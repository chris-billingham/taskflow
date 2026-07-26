import crypto from 'node:crypto';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { hashPassword } from '../utils/password.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/index.js';
import { disconnectUserSockets } from '../websocket/events.js';
import { deleteUser as deleteAccount, provisionUser } from './userService.js';
import type { Prisma, SystemRole } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Instance administration: the account lifecycle for the whole deployment.
//
// A SystemRole.ADMIN manages ACCOUNTS, not content. Nothing here grants an
// admin read access to another user's tasks, projects or comments — that is
// still governed entirely by services/access.ts. Keeping the two separate
// means "promote to admin" can never be a quiet privilege escalation into
// everyone's data.
//
// Two invariants hold across every mutation below:
//   1. The deployment can never be left without a usable administrator.
//   2. An admin cannot lock themselves out with a single click.
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  isActive: true,
  emailVerified: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
} satisfies Prisma.UserSelect;

// Unambiguous alphabet: no O/0, I/l/1 — these get read aloud and retyped.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const GENERATED_PASSWORD_LENGTH = 20;

/**
 * Cryptographically random temporary password. `crypto.randomInt` rejection-
 * samples, so there is no modulo bias across the alphabet.
 */
export function generatePassword(length = GENERATED_PASSWORD_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[crypto.randomInt(0, PASSWORD_ALPHABET.length)];
  }
  return out;
}

/**
 * Ends every session a user holds: refresh tokens are deleted so nothing can
 * be renewed, and live sockets are dropped so an open tab stops streaming.
 * Their current access token still works until it expires (15 minutes) — the
 * API verifies access tokens statelessly by design.
 */
async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId } });
  disconnectUserSockets(userId);
}

/**
 * Refuses an action that would leave the instance with no administrator who
 * can actually sign in. Only ACTIVE admins count: a suspended admin cannot
 * log in, so they are not a way back into the console.
 */
async function assertNotLastAdmin(targetId: string, action: string): Promise<void> {
  const remaining = await prisma.user.count({
    where: { role: 'ADMIN', isActive: true, id: { not: targetId } },
  });
  if (remaining === 0) {
    throw new ConflictError(
      `Cannot ${action} the last active administrator. ` +
        'Promote another user to admin first.',
    );
  }
}

async function getUserOrThrow(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return user;
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function listUsers(
  options: {
    search?: string;
    role?: SystemRole;
    isActive?: boolean;
    page?: number;
    limit?: number;
  } = {},
) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));
  const search = options.search?.trim();

  const where: Prisma.UserWhereInput = {
    ...(options.role ? { role: options.role } : {}),
    ...(options.isActive === undefined ? {} : { isActive: options.isActive }),
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: ADMIN_USER_SELECT,
      // Admins first, then newest — the console's most useful default order.
      // Postgres orders an enum by its DECLARATION order, not alphabetically,
      // and SystemRole is declared ('USER', 'ADMIN'); so descending is what
      // puts administrators at the top.
      orderBy: [{ role: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getUserDetail(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...ADMIN_USER_SELECT,
      timezone: true,
      workspaceMemberships: {
        select: {
          role: true,
          joinedAt: true,
          workspace: { select: { id: true, name: true, slug: true } },
        },
      },
      _count: {
        select: {
          ownedWorkspaces: true,
          ownedProjects: true,
          createdTasks: true,
          assignedTasks: true,
        },
      },
    },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }
  return user;
}

export async function getStats() {
  const [total, active, admins, unverified] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { role: 'ADMIN', isActive: true } }),
    prisma.user.count({ where: { emailVerified: false } }),
  ]);
  return { total, active, suspended: total - active, admins, unverified };
}

// ── Write ────────────────────────────────────────────────────────────────────

/**
 * Creates an account on a user's behalf. Admin-created accounts are verified
 * up front: an admin vouching for the address is the verification, and it
 * avoids stranding the new user when SMTP is not configured.
 *
 * Returns the generated password exactly once when the admin did not supply
 * one. It is never stored in plaintext, logged, or retrievable afterwards.
 */
export async function createUser(data: {
  email: string;
  name: string;
  password?: string;
  role?: SystemRole;
}) {
  const email = data.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ConflictError('A user with this email already exists');
  }

  // Only a password WE generated is ever handed back to the caller; one the
  // admin typed is already known to them and does not need echoing.
  let generated: string | null = null;
  let plainPassword = data.password;
  if (!plainPassword) {
    plainPassword = generatePassword();
    generated = plainPassword;
  }
  const passwordHash = await hashPassword(plainPassword);

  const user = await prisma.$transaction((tx) =>
    provisionUser(tx, {
      email,
      passwordHash,
      name: data.name,
      emailVerified: true,
      role: data.role ?? 'USER',
    }),
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    },
    temporaryPassword: generated,
  };
}

/**
 * Promotes or demotes an account. Self-demotion is permitted, but only while
 * another active admin remains — the last-admin guard covers that case and
 * demoting a colleague identically, so no actor identity is needed here.
 *
 * A demotion takes effect on the target's very next request: requireAdmin
 * re-reads the role from the database instead of trusting their JWT.
 */
export async function setUserRole(targetId: string, role: SystemRole) {
  const target = await getUserOrThrow(targetId);

  if (target.role === role) {
    // Already there — don't burn an UPDATE (and an updatedAt bump) on a no-op.
    return prisma.user.findUniqueOrThrow({
      where: { id: targetId },
      select: ADMIN_USER_SELECT,
    });
  }

  if (target.role === 'ADMIN' && role === 'USER') {
    await assertNotLastAdmin(targetId, 'demote');
  }

  return prisma.user.update({
    where: { id: targetId },
    data: { role },
    select: ADMIN_USER_SELECT,
  });
}

export async function setUserActive(actorId: string, targetId: string, isActive: boolean) {
  if (targetId === actorId && !isActive) {
    throw new ValidationError('You cannot deactivate your own account');
  }

  const target = await getUserOrThrow(targetId);

  if (target.role === 'ADMIN' && !isActive) {
    await assertNotLastAdmin(targetId, 'deactivate');
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { isActive },
    select: ADMIN_USER_SELECT,
  });

  // Suspension must end the session now, not whenever the user next logs out.
  if (!isActive) {
    await revokeAllSessions(targetId);
  }

  return updated;
}

/**
 * Sets a new password for another account without knowing the old one. Always
 * revokes the target's sessions: the point of an admin reset is that the
 * previous credentials are no longer trusted.
 */
export async function resetUserPassword(targetId: string, password?: string) {
  await getUserOrThrow(targetId);

  let generated: string | null = null;
  let plainPassword = password;
  if (!plainPassword) {
    plainPassword = generatePassword();
    generated = plainPassword;
  }

  await prisma.user.update({
    where: { id: targetId },
    data: { passwordHash: await hashPassword(plainPassword) },
  });

  await revokeAllSessions(targetId);

  return {
    temporaryPassword: generated,
    message: "Password reset. All of that user's sessions have been revoked.",
  };
}

/**
 * Permanently deletes an account. Delegates to the self-service deletion path
 * so both routes enforce the same rule: a user who still owns a workspace
 * with other members in it cannot be deleted, because that would take the
 * team's projects and tasks down with them.
 */
export async function deleteUser(actorId: string, targetId: string) {
  if (targetId === actorId) {
    throw new ValidationError(
      'You cannot delete your own account from the admin console. ' +
        'Use Settings → Account instead.',
    );
  }

  const target = await getUserOrThrow(targetId);

  if (target.role === 'ADMIN') {
    await assertNotLastAdmin(targetId, 'delete');
  }

  // Delete FIRST: deleteAccount refuses when the user still owns a shared
  // workspace, and a refused delete must not have kicked them offline on the
  // way out. Their refresh tokens cascade with the row, so only live sockets
  // need closing afterwards.
  const result = await deleteAccount(targetId);
  disconnectUserSockets(targetId);
  return result;
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

/**
 * Promotes accounts listed in ADMIN_EMAILS at boot, for the case where the
 * account already existed before the address was added to the config.
 *
 * Deliberately promote-only. It never demotes an admin granted through the
 * console (config is not the whole truth), and it never reactivates a
 * suspended account — an operator who suspends a departing colleague must not
 * find them signed back in after the next restart.
 *
 * Addresses with no account are reported, not created: registration still has
 * to happen first, and isBootstrapAdminEmail makes that sign-up an admin.
 */
export async function syncAdminsFromEnv(
  adminEmails: string[] = env.ADMIN_EMAILS,
  log?: { info: (msg: string) => void; warn: (msg: string) => void },
): Promise<{ promoted: string[]; missing: string[] }> {
  const emails = adminEmails
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);

  if (emails.length === 0) {
    return { promoted: [], missing: [] };
  }

  const found = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true, role: true },
  });

  const foundEmails = new Set(found.map((u) => u.email.toLowerCase()));
  const missing = emails.filter((e) => !foundEmails.has(e));

  const needsPromotion = found.filter((u) => u.role !== 'ADMIN');
  if (needsPromotion.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: needsPromotion.map((u) => u.id) } },
      data: { role: 'ADMIN' },
    });
  }

  const promoted = needsPromotion.map((u) => u.email);
  if (promoted.length > 0) {
    log?.info(`[admin] promoted from ADMIN_EMAILS: ${promoted.join(', ')}`);
  }
  if (missing.length > 0) {
    log?.warn(
      `[admin] ADMIN_EMAILS lists ${missing.length} address(es) with no account yet: ` +
        `${missing.join(', ')}. Each becomes an admin when it registers.`,
    );
  }

  return { promoted, missing };
}
