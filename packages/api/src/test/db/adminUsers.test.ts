import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/database.js';
import * as adminService from '../../services/adminService.js';
import { login, register, refreshTokens } from '../../services/authService.js';
import { requireProjectAccess } from '../../services/access.js';
import { hashPassword } from '../../utils/password.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../errors/index.js';

// End-to-end account administration against real Postgres: constraints,
// transactions and the guards that keep an instance administrable.

const RUN = randomUUID().slice(0, 8);
const SUFFIX = `-${RUN}@admin.test`;
// Matches ADMIN_EMAILS in vitest.db.config.ts. Fixed (not run-scoped) because
// the environment is parsed once at import.
const BOOTSTRAP_EMAIL = 'bootstrap-admin@admin.test';

const ids: Record<string, string> = {};

async function mkUser(
  key: string,
  overrides: { role?: 'USER' | 'ADMIN'; isActive?: boolean; password?: string } = {},
) {
  const user = await prisma.user.create({
    data: {
      email: `${key}${SUFFIX}`,
      name: `admin-test-${key}`,
      passwordHash: await hashPassword(overrides.password ?? 'InitialPass123'),
      emailVerified: true,
      role: overrides.role ?? 'USER',
      isActive: overrides.isActive ?? true,
    },
  });
  ids[key] = user.id;
  return user;
}

/** Removes every account this file created, plus anything it owns. */
async function purge(emailFilter: { endsWith?: string; equals?: string }) {
  const users = await prisma.user.findMany({
    where: { email: emailFilter },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return;

  await prisma.workspace.deleteMany({ where: { ownerId: { in: userIds } } });
  await prisma.project.deleteMany({ where: { ownerId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

beforeAll(async () => {
  // A previous interrupted run must not make register() conflict here.
  await purge({ equals: BOOTSTRAP_EMAIL });
  await mkUser('admin', { role: 'ADMIN' });
  await mkUser('admin2', { role: 'ADMIN' });
  await mkUser('target');
});

afterAll(async () => {
  await purge({ endsWith: SUFFIX });
  await purge({ equals: BOOTSTRAP_EMAIL });
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Reset the shared fixtures so ordering between tests cannot matter.
  await prisma.user.update({
    where: { id: ids.admin },
    data: { role: 'ADMIN', isActive: true },
  });
  await prisma.user.update({
    where: { id: ids.admin2 },
    data: { role: 'ADMIN', isActive: true },
  });
  await prisma.user.update({
    where: { id: ids.target },
    data: { role: 'USER', isActive: true },
  });
});

describe('createUser', () => {
  it('provisions the account, its personal workspace and its inbox', async () => {
    const email = `created${SUFFIX}`;
    const { user, temporaryPassword } = await adminService.createUser({
      email,
      name: 'Created User',
    });

    expect(temporaryPassword).toEqual(expect.any(String));

    const workspace = await prisma.workspace.findFirst({
      where: { ownerId: user.id },
      include: { members: true, projects: true },
    });
    expect(workspace?.name).toBe('Personal');
    // Without a membership row the workspace is invisible to its own owner.
    expect(workspace?.members).toHaveLength(1);
    expect(workspace?.members[0].role).toBe('OWNER');
    expect(workspace?.projects.some((p) => p.isInbox)).toBe(true);
  });

  it('creates an account that can immediately sign in with the generated password', async () => {
    const email = `signin${SUFFIX}`;
    const { temporaryPassword } = await adminService.createUser({
      email,
      name: 'Sign In',
    });

    const result = await login(email, temporaryPassword as string);
    expect(result.user.email).toBe(email);
    expect(result.accessToken).toEqual(expect.any(String));
  });

  it('stores only a hash, never the plaintext password', async () => {
    const email = `hashed${SUFFIX}`;
    const { user, temporaryPassword } = await adminService.createUser({
      email,
      name: 'Hashed',
    });

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.passwordHash).not.toContain(temporaryPassword as string);
    expect(row.passwordHash.startsWith('$2')).toBe(true);
  });

  it('refuses a duplicate address regardless of casing', async () => {
    await expect(
      adminService.createUser({
        email: `TARGET${SUFFIX}`.toUpperCase(),
        name: 'Dupe',
      }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('suspension', () => {
  it('blocks sign-in and removes refresh tokens, then restores both', async () => {
    const email = `suspendme${SUFFIX}`;
    const { temporaryPassword } = await adminService.createUser({
      email,
      name: 'Suspend Me',
    });
    const password = temporaryPassword as string;

    const session = await login(email, password);
    const created = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(await prisma.refreshToken.count({ where: { userId: created.id } })).toBe(1);

    await adminService.setUserActive(ids.admin, created.id, false);

    // Password is still correct — the account is simply closed.
    await expect(login(email, password)).rejects.toThrow(UnauthorizedError);
    expect(await prisma.refreshToken.count({ where: { userId: created.id } })).toBe(0);
    // And the refresh token they were holding is dead.
    await expect(refreshTokens(session.refreshToken)).rejects.toThrow(
      UnauthorizedError,
    );

    await adminService.setUserActive(ids.admin, created.id, true);
    await expect(login(email, password)).resolves.toBeTruthy();
  });

  it('refuses to let an admin suspend themselves', async () => {
    await expect(
      adminService.setUserActive(ids.admin, ids.admin, false),
    ).rejects.toThrow(ValidationError);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: ids.admin } });
    expect(row.isActive).toBe(true);
  });
});

describe('password reset', () => {
  it('invalidates the old password, activates the new one, and clears sessions', async () => {
    const email = `resetme${SUFFIX}`;
    const { user, temporaryPassword } = await adminService.createUser({
      email,
      name: 'Reset Me',
    });
    const oldPassword = temporaryPassword as string;

    await login(email, oldPassword);
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(1);

    const { temporaryPassword: newPassword } = await adminService.resetUserPassword(
      user.id,
    );

    await expect(login(email, oldPassword)).rejects.toThrow(UnauthorizedError);
    await expect(login(email, newPassword as string)).resolves.toBeTruthy();
    // The pre-reset session was revoked (the post-reset login made a new one).
    const tokens = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(tokens).toHaveLength(1);
  });

  it('accepts an explicit password from the admin', async () => {
    const email = `explicitpw${SUFFIX}`;
    const { user } = await adminService.createUser({ email, name: 'Explicit' });

    const result = await adminService.resetUserPassword(user.id, 'AdminChosen123!');

    expect(result.temporaryPassword).toBeNull();
    await expect(login(email, 'AdminChosen123!')).resolves.toBeTruthy();
  });

  it('throws NotFoundError for an unknown account', async () => {
    await expect(adminService.resetUserPassword('does-not-exist')).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe('last-administrator guards', () => {
  beforeEach(async () => {
    // Leave exactly one active admin among the fixtures for these cases.
    await prisma.user.update({
      where: { id: ids.admin2 },
      data: { role: 'USER' },
    });
  });

  async function otherActiveAdmins(excludeId: string) {
    return prisma.user.count({
      where: { role: 'ADMIN', isActive: true, id: { not: excludeId } },
    });
  }

  it('refuses to demote, suspend or delete the last active admin', async () => {
    // Guard against other rows in a shared dev database making this vacuous.
    if ((await otherActiveAdmins(ids.admin)) > 0) return;

    await expect(adminService.setUserRole(ids.admin, 'USER')).rejects.toThrow(
      ConflictError,
    );
    await expect(
      adminService.setUserActive(ids.admin2, ids.admin, false),
    ).rejects.toThrow(ConflictError);
    await expect(adminService.deleteUser(ids.admin2, ids.admin)).rejects.toThrow(
      ConflictError,
    );

    const row = await prisma.user.findUniqueOrThrow({ where: { id: ids.admin } });
    expect(row.role).toBe('ADMIN');
    expect(row.isActive).toBe(true);
  });

  it('allows demotion once a second admin exists', async () => {
    await adminService.setUserRole(ids.admin2, 'ADMIN');

    const updated = await adminService.setUserRole(ids.admin, 'USER');
    expect(updated.role).toBe('USER');
  });

  it('does not count a SUSPENDED admin as a way back in', async () => {
    // admin2 is an admin again, but suspended — so it must not unlock
    // demoting the only admin who can actually sign in.
    await prisma.user.update({
      where: { id: ids.admin2 },
      data: { role: 'ADMIN', isActive: false },
    });
    if ((await otherActiveAdmins(ids.admin)) > 0) return;

    await expect(adminService.setUserRole(ids.admin, 'USER')).rejects.toThrow(
      ConflictError,
    );
  });
});

describe('deletion', () => {
  it('removes the account and its personal workspace', async () => {
    const email = `deleteme${SUFFIX}`;
    const { user } = await adminService.createUser({ email, name: 'Delete Me' });

    await adminService.deleteUser(ids.admin, user.id);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.workspace.count({ where: { ownerId: user.id } })).toBe(0);
  });

  it('refuses while the account owns a workspace other people are in', async () => {
    const email = `owner${SUFFIX}`;
    const { user } = await adminService.createUser({ email, name: 'Team Owner' });

    const shared = await prisma.workspace.create({
      data: {
        name: `Shared ${RUN}`,
        slug: `shared-${RUN}`,
        ownerId: user.id,
        members: {
          create: [
            { userId: user.id, role: 'OWNER' },
            { userId: ids.target, role: 'MEMBER' },
          ],
        },
      },
    });

    const err = await adminService.deleteUser(ids.admin, user.id).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toMatch(/transfer ownership/i);

    // Nothing was destroyed on the way to refusing.
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
    expect(
      await prisma.workspace.findUnique({ where: { id: shared.id } }),
    ).not.toBeNull();

    await prisma.workspace.delete({ where: { id: shared.id } });
  });

  it('refuses self-deletion from the admin console', async () => {
    await expect(adminService.deleteUser(ids.admin, ids.admin)).rejects.toThrow(
      ValidationError,
    );
    expect(
      await prisma.user.findUnique({ where: { id: ids.admin } }),
    ).not.toBeNull();
  });
});

describe('admin role is account administration, not data access', () => {
  it('does not grant an admin any access to another user’s project', async () => {
    const project = await prisma.project.create({
      data: { name: `Private ${RUN}`, ownerId: ids.target },
    });

    // The instance admin is not a member and not the owner: still forbidden.
    await expect(
      requireProjectAccess(project.id, ids.admin, 'VIEW'),
    ).rejects.toThrow(ForbiddenError);

    await prisma.project.delete({ where: { id: project.id } });
  });
});

describe('ADMIN_EMAILS bootstrap', () => {
  it('promotes an existing account listed in the configuration', async () => {
    const result = await adminService.syncAdminsFromEnv([`target${SUFFIX}`]);

    expect(result.promoted).toEqual([`target${SUFFIX}`]);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: ids.target } });
    expect(row.role).toBe('ADMIN');
  });

  it('is idempotent and never demotes on a second pass', async () => {
    await adminService.syncAdminsFromEnv([`target${SUFFIX}`]);
    const second = await adminService.syncAdminsFromEnv([`target${SUFFIX}`]);

    expect(second.promoted).toEqual([]);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: ids.target } });
    expect(row.role).toBe('ADMIN');
  });

  it('never reactivates a suspended account it promotes', async () => {
    await prisma.user.update({
      where: { id: ids.target },
      data: { role: 'USER', isActive: false },
    });

    await adminService.syncAdminsFromEnv([`target${SUFFIX}`]);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: ids.target } });
    expect(row.role).toBe('ADMIN');
    // A deliberately suspended colleague must not be back online after a restart.
    expect(row.isActive).toBe(false);
  });

  it('reports configured addresses with no account yet', async () => {
    const result = await adminService.syncAdminsFromEnv([`ghost${SUFFIX}`]);
    expect(result.missing).toEqual([`ghost${SUFFIX}`]);
    expect(result.promoted).toEqual([]);
  });

  it('makes a matching self-service registration an admin immediately', async () => {
    // Fresh-install path: the operator signs up and can administer at once,
    // with no restart needed to pick up the promotion.
    const result = await register({
      email: BOOTSTRAP_EMAIL,
      name: 'Bootstrap Admin',
      password: 'BootstrapPass123',
    });

    expect(result.user.role).toBe('ADMIN');
    const row = await prisma.user.findUniqueOrThrow({
      where: { email: BOOTSTRAP_EMAIL },
    });
    expect(row.role).toBe('ADMIN');
  });
});
