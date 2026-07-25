import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database.js', () => {
  const mockPrismaClient = {
    user: { findUnique: vi.fn(), delete: vi.fn() },
    workspace: { findMany: vi.fn(), delete: vi.fn() },
    refreshToken: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  };
  mockPrismaClient.$transaction.mockImplementation(
    (fn: (tx: typeof mockPrismaClient) => unknown) => fn(mockPrismaClient),
  );
  return { prisma: mockPrismaClient };
});

import { prisma } from '../../config/database.js';
import { deleteUser } from '../../services/userService.js';
import { ConflictError, NotFoundError } from '../../errors/index.js';

const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  workspace: { findMany: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const USER_ID = 'user-1';

beforeEach(() => {
  mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID, email: 'u@e.com' });
  mockPrisma.workspace.findMany.mockResolvedValue([]);
  mockPrisma.workspace.delete.mockResolvedValue({});
  mockPrisma.user.delete.mockResolvedValue({});
});

describe('deleteUser', () => {
  it('throws NotFoundError for an unknown user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(deleteUser('nope')).rejects.toThrow(NotFoundError);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses while the user owns a workspace with other members', async () => {
    mockPrisma.workspace.findMany.mockResolvedValue([
      { id: 'ws-personal', name: 'Personal', members: [] },
      { id: 'ws-team', name: 'Acme Team', members: [{ userId: 'user-2' }] },
    ]);

    const err = await deleteUser(USER_ID).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toContain('Acme Team');
    // Nothing may be deleted when the guard trips.
    expect(mockPrisma.workspace.delete).not.toHaveBeenCalled();
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it('deletes sole-member workspaces and then the account', async () => {
    mockPrisma.workspace.findMany.mockResolvedValue([
      { id: 'ws-personal', name: 'Personal', members: [] },
      { id: 'ws-solo', name: 'Side Project', members: [] },
    ]);

    const result = await deleteUser(USER_ID);
    expect(result.message).toMatch(/deleted/i);
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockPrisma.workspace.delete).toHaveBeenCalledTimes(2);
    expect(mockPrisma.workspace.delete).toHaveBeenCalledWith({ where: { id: 'ws-personal' } });
    expect(mockPrisma.workspace.delete).toHaveBeenCalledWith({ where: { id: 'ws-solo' } });
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: USER_ID } });
  });

  it('only counts OTHER users as blocking members', async () => {
    // The owner's own membership row must not block deletion — the query
    // filters it out; simulate that contract here.
    mockPrisma.workspace.findMany.mockResolvedValue([
      { id: 'ws-personal', name: 'Personal', members: [] },
    ]);
    await expect(deleteUser(USER_ID)).resolves.toBeTruthy();
    const query = mockPrisma.workspace.findMany.mock.calls[0][0];
    expect(query.select.members.where).toEqual({ userId: { not: USER_ID } });
  });
});
