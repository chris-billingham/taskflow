import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database.js', () => {
  const mockPrismaClient = {
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    workspace: { create: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
    project: { create: vi.fn() },
    // adminService.deleteUser delegates to userService.deleteUser, which now
    // collects attachment keys so the cascades don't strand the objects.
    attachment: { findMany: vi.fn() },
    refreshToken: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  };
  mockPrismaClient.$transaction.mockImplementation(
    (fn: (tx: typeof mockPrismaClient) => unknown) => fn(mockPrismaClient),
  );
  return { prisma: mockPrismaClient };
});

vi.mock('../../config/storage.js', () => ({
  deleteObjects: vi.fn(),
}));

vi.mock('../../utils/password.js', () => ({
  hashPassword: vi.fn(async (pw: string) => `hashed:${pw}`),
  verifyPassword: vi.fn(),
}));

vi.mock('../../websocket/events.js', () => ({
  disconnectUserSockets: vi.fn(),
}));

import { prisma } from '../../config/database.js';
import { hashPassword } from '../../utils/password.js';
import { disconnectUserSockets } from '../../websocket/events.js';
import {
  generatePassword,
  createUser,
  setUserRole,
  setUserActive,
  resetUserPassword,
  deleteUser,
  syncAdminsFromEnv,
  listUsers,
} from '../../services/adminService.js';
import { ConflictError, NotFoundError, ValidationError } from '../../errors/index.js';

const mockPrisma = prisma as unknown as {
  user: Record<string, ReturnType<typeof vi.fn>>;
  workspace: Record<string, ReturnType<typeof vi.fn>>;
  project: Record<string, ReturnType<typeof vi.fn>>;
  attachment: Record<string, ReturnType<typeof vi.fn>>;
  refreshToken: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};

const ADMIN_ID = 'admin-1';
const TARGET_ID = 'user-2';

const targetUser = {
  id: TARGET_ID,
  email: 'target@example.com',
  name: 'Target User',
  role: 'USER' as const,
  isActive: true,
};

beforeEach(() => {
  mockPrisma.user.findUnique.mockResolvedValue(targetUser);
  mockPrisma.user.findUniqueOrThrow.mockResolvedValue(targetUser);
  mockPrisma.user.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ ...targetUser, ...data }),
  );
  mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.user.create.mockResolvedValue({
    ...targetUser,
    emailVerified: true,
    createdAt: new Date('2026-07-26T00:00:00Z'),
  });
  // By default another active admin exists, so guards do not trip.
  mockPrisma.user.count.mockResolvedValue(1);
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.workspace.create.mockResolvedValue({ id: 'ws-new' });
  mockPrisma.workspace.findMany.mockResolvedValue([]);
  mockPrisma.project.create.mockResolvedValue({ id: 'proj-new' });
  mockPrisma.attachment.findMany.mockResolvedValue([]);
  mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
});

describe('generatePassword', () => {
  it('returns the requested length from an unambiguous alphabet', () => {
    const pw = generatePassword(24);
    expect(pw).toHaveLength(24);
    // No characters that get misread when a password is retyped by hand.
    expect(pw).not.toMatch(/[O0Il1]/);
  });

  it('does not repeat across calls', () => {
    const passwords = new Set(Array.from({ length: 50 }, () => generatePassword()));
    expect(passwords.size).toBe(50);
  });
});

describe('createUser', () => {
  it('rejects an email that already exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(targetUser);
    await expect(
      createUser({ email: 'target@example.com', name: 'Dupe' }),
    ).rejects.toThrow(ConflictError);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('generates a password when none is supplied and returns it exactly once', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await createUser({ email: 'new@example.com', name: 'New' });

    expect(result.temporaryPassword).toEqual(expect.any(String));
    expect(result.temporaryPassword).toHaveLength(20);
    // Only the hash is persisted.
    expect(hashPassword).toHaveBeenCalledWith(result.temporaryPassword);
    const created = mockPrisma.user.create.mock.calls[0][0].data;
    expect(created.passwordHash).toBe(`hashed:${result.temporaryPassword}`);
  });

  it('never echoes back a password the admin typed', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await createUser({
      email: 'new@example.com',
      name: 'New',
      password: 'chosen-password',
    });

    expect(result.temporaryPassword).toBeNull();
    expect(hashPassword).toHaveBeenCalledWith('chosen-password');
  });

  it('normalises the email and marks admin-created accounts verified', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await createUser({ email: '  MixedCase@Example.COM ', name: 'New' });

    const created = mockPrisma.user.create.mock.calls[0][0].data;
    expect(created.email).toBe('mixedcase@example.com');
    // No verification email can be sent on an SMTP-less install; an admin
    // vouching for the address IS the verification.
    expect(created.emailVerified).toBe(true);
  });

  it('provisions the personal workspace and inbox atomically', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await createUser({ email: 'new@example.com', name: 'New' });

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockPrisma.workspace.create).toHaveBeenCalledOnce();
    expect(mockPrisma.project.create).toHaveBeenCalledOnce();
    expect(mockPrisma.project.create.mock.calls[0][0].data.isInbox).toBe(true);
  });

  it('can create another administrator directly', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await createUser({ email: 'new@example.com', name: 'New', role: 'ADMIN' });
    expect(mockPrisma.user.create.mock.calls[0][0].data.role).toBe('ADMIN');
  });
});

describe('setUserRole', () => {
  it('promotes a user to admin', async () => {
    await setUserRole(TARGET_ID, 'ADMIN');
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TARGET_ID }, data: { role: 'ADMIN' } }),
    );
  });

  it('refuses to demote the last active administrator', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...targetUser, role: 'ADMIN' });
    mockPrisma.user.count.mockResolvedValue(0); // nobody else left

    await expect(setUserRole(TARGET_ID, 'USER')).rejects.toThrow(ConflictError);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('counts only OTHER active admins when deciding', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...targetUser, role: 'ADMIN' });
    mockPrisma.user.count.mockResolvedValue(1);

    await setUserRole(TARGET_ID, 'USER');

    expect(mockPrisma.user.count).toHaveBeenCalledWith({
      where: { role: 'ADMIN', isActive: true, id: { not: TARGET_ID } },
    });
    expect(mockPrisma.user.update).toHaveBeenCalled();
  });

  it('does not write when the role is already what was asked for', async () => {
    await setUserRole(TARGET_ID, 'USER');
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUniqueOrThrow).toHaveBeenCalled();
  });

  it('throws NotFoundError for an unknown user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(setUserRole('nope', 'ADMIN')).rejects.toThrow(NotFoundError);
  });
});

describe('setUserActive', () => {
  it('refuses to let an admin deactivate themselves', async () => {
    await expect(setUserActive(ADMIN_ID, ADMIN_ID, false)).rejects.toThrow(
      ValidationError,
    );
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('allows reactivating yourself (a no-op that cannot lock anyone out)', async () => {
    await expect(setUserActive(ADMIN_ID, ADMIN_ID, true)).resolves.toBeTruthy();
  });

  it('refuses to suspend the last active administrator', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...targetUser, role: 'ADMIN' });
    mockPrisma.user.count.mockResolvedValue(0);

    await expect(setUserActive(ADMIN_ID, TARGET_ID, false)).rejects.toThrow(
      ConflictError,
    );
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('ends every session when suspending', async () => {
    await setUserActive(ADMIN_ID, TARGET_ID, false);

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: TARGET_ID },
    });
    expect(disconnectUserSockets).toHaveBeenCalledWith(TARGET_ID);
  });

  it('leaves sessions alone when reactivating', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...targetUser, isActive: false });

    await setUserActive(ADMIN_ID, TARGET_ID, true);

    expect(mockPrisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    expect(disconnectUserSockets).not.toHaveBeenCalled();
  });
});

describe('resetUserPassword', () => {
  it('generates a password, stores only its hash, and revokes sessions', async () => {
    const result = await resetUserPassword(TARGET_ID);

    expect(result.temporaryPassword).toEqual(expect.any(String));
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: { passwordHash: `hashed:${result.temporaryPassword}` },
    });
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: TARGET_ID },
    });
    expect(disconnectUserSockets).toHaveBeenCalledWith(TARGET_ID);
  });

  it('uses an admin-supplied password and returns nothing to display', async () => {
    const result = await resetUserPassword(TARGET_ID, 'admin-chosen-pw');

    expect(result.temporaryPassword).toBeNull();
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: { passwordHash: 'hashed:admin-chosen-pw' },
    });
  });

  it('throws NotFoundError for an unknown user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(resetUserPassword('nope')).rejects.toThrow(NotFoundError);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe('deleteUser', () => {
  it('refuses self-deletion from the admin console', async () => {
    await expect(deleteUser(ADMIN_ID, ADMIN_ID)).rejects.toThrow(ValidationError);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete the last active administrator', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...targetUser, role: 'ADMIN' });
    mockPrisma.user.count.mockResolvedValue(0);

    await expect(deleteUser(ADMIN_ID, TARGET_ID)).rejects.toThrow(ConflictError);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it('deletes the account and drops its live sockets', async () => {
    mockPrisma.user.delete.mockResolvedValue({});

    await deleteUser(ADMIN_ID, TARGET_ID);

    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: TARGET_ID } });
    expect(disconnectUserSockets).toHaveBeenCalledWith(TARGET_ID);
  });

  it('does not sign the user out when the shared-workspace guard refuses', async () => {
    // Owning a workspace that other people are members of blocks deletion.
    mockPrisma.workspace.findMany.mockResolvedValue([
      { id: 'ws-team', name: 'Acme Team', members: [{ userId: 'someone-else' }] },
    ]);

    await expect(deleteUser(ADMIN_ID, TARGET_ID)).rejects.toThrow(ConflictError);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    // A refused delete must not have kicked them offline as a side effect.
    expect(disconnectUserSockets).not.toHaveBeenCalled();
  });
});

describe('syncAdminsFromEnv', () => {
  it('does nothing when no addresses are configured', async () => {
    const result = await syncAdminsFromEnv([]);
    expect(result).toEqual({ promoted: [], missing: [] });
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it('promotes only the accounts that are not already admins', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'boss@example.com', role: 'USER' },
      { id: 'u2', email: 'already@example.com', role: 'ADMIN' },
    ]);

    const result = await syncAdminsFromEnv([
      'Boss@Example.com',
      'already@example.com',
    ]);

    expect(result.promoted).toEqual(['boss@example.com']);
    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['u1'] } },
      data: { role: 'ADMIN' },
    });
  });

  it('never demotes and never reactivates', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'boss@example.com', role: 'USER' },
    ]);

    await syncAdminsFromEnv(['boss@example.com']);

    // A suspended colleague listed in ADMIN_EMAILS must not come back online
    // at the next restart, and nothing outside the list is touched.
    const { data, where } = mockPrisma.user.updateMany.mock.calls[0][0];
    expect(data).toEqual({ role: 'ADMIN' });
    expect(data).not.toHaveProperty('isActive');
    expect(where).toEqual({ id: { in: ['u1'] } });
  });

  it('reports configured addresses that have no account yet', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    const result = await syncAdminsFromEnv(['ghost@example.com']);

    expect(result.missing).toEqual(['ghost@example.com']);
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('listUsers', () => {
  it('clamps pagination and searches name and email case-insensitively', async () => {
    mockPrisma.user.count.mockResolvedValue(0);

    await listUsers({ search: '  ada  ', page: 0, limit: 5000 });

    const query = mockPrisma.user.findMany.mock.calls[0][0];
    expect(query.take).toBe(100); // limit clamped
    expect(query.skip).toBe(0); // page floored to 1
    expect(query.where.OR).toEqual([
      { email: { contains: 'ada', mode: 'insensitive' } },
      { name: { contains: 'ada', mode: 'insensitive' } },
    ]);
  });

  it('reports at least one page even when empty', async () => {
    mockPrisma.user.count.mockResolvedValue(0);
    const result = await listUsers({});
    expect(result.pages).toBe(1);
    expect(result.total).toBe(0);
  });
});
