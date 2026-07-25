import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database.js', () => ({
  prisma: {
    project: { findUnique: vi.fn(), findMany: vi.fn() },
    projectMember: { findUnique: vi.fn() },
    workspaceMember: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

// presence.ts starts a module-level cleanup interval — keep it out of unit tests.
vi.mock('../../websocket/presence.js', () => ({
  updatePresence: vi.fn(),
  removePresence: vi.fn(),
}));

import { prisma } from '../../config/database.js';
import { registerHandlers } from '../../websocket/handlers.js';

const mockPrisma = prisma as unknown as {
  project: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  projectMember: { findUnique: ReturnType<typeof vi.fn> };
  workspaceMember: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

const USER_ID = 'user-1';

function createFakeSocket() {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    data: { user: { id: USER_ID, email: 'u@example.com', name: 'User One' } },
    connected: true,
    rooms: new Set<string>(),
    join: vi.fn(),
    leave: vi.fn(),
    to: vi.fn(() => ({ emit: vi.fn() })),
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      handlers.set(event, fn);
    }),
    handlers,
  };
}

type FakeSocket = ReturnType<typeof createFakeSocket>;

function register(): FakeSocket {
  const socket = createFakeSocket();
  registerHandlers(socket as unknown as Parameters<typeof registerHandlers>[0]);
  return socket;
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  // Auto-join defaults: no memberships, no projects.
  mockPrisma.workspaceMember.findMany.mockResolvedValue([]);
  mockPrisma.project.findMany.mockResolvedValue([]);
  mockPrisma.workspaceMember.findUnique.mockResolvedValue(null);
  mockPrisma.projectMember.findUnique.mockResolvedValue(null);
  mockPrisma.project.findUnique.mockResolvedValue(null);
});

describe('connection auto-join', () => {
  it('always joins the personal user room', () => {
    const socket = register();
    expect(socket.join).toHaveBeenCalledWith(`user:${USER_ID}`);
  });

  it('joins every accessible project and workspace room', async () => {
    mockPrisma.workspaceMember.findMany.mockResolvedValue([{ workspaceId: 'w1' }]);
    mockPrisma.project.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);

    const socket = register();
    await flush();

    expect(socket.join).toHaveBeenCalledWith([
      'workspace:w1',
      'project:p1',
      'project:p2',
    ]);
    // The project query must include workspace projects, not just owned/member.
    const where = mockPrisma.project.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ workspaceId: { in: ['w1'] } });
  });

  it('joins nothing extra when the user has no projects', async () => {
    const socket = register();
    await flush();

    const joins = socket.join.mock.calls.map((c) => c[0]);
    expect(joins).toEqual([`user:${USER_ID}`]);
  });
});

describe('subscribe:project', () => {
  it('grants and acks a project the user owns', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      ownerId: USER_ID,
      workspaceId: null,
    });
    const socket = register();
    const ack = vi.fn();

    socket.handlers.get('subscribe:project')!({ projectId: 'p9' }, ack);
    await flush();

    expect(socket.join).toHaveBeenCalledWith('project:p9');
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it('denies and acks a project the user cannot access', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      ownerId: 'someone-else',
      workspaceId: null,
    });
    const socket = register();
    const ack = vi.fn();

    socket.handlers.get('subscribe:project')!({ projectId: 'p9' }, ack);
    await flush();

    expect(socket.join).not.toHaveBeenCalledWith('project:p9');
    expect(ack).toHaveBeenCalledWith({ ok: false });
  });

  it('grants via workspace membership', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      ownerId: 'someone-else',
      workspaceId: 'w1',
    });
    mockPrisma.workspaceMember.findUnique.mockResolvedValue({ userId: USER_ID });
    const socket = register();
    const ack = vi.fn();

    socket.handlers.get('subscribe:project')!({ projectId: 'p9' }, ack);
    await flush();

    expect(socket.join).toHaveBeenCalledWith('project:p9');
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it('joins the workspace room only with membership', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      ownerId: USER_ID,
      workspaceId: null,
    });
    mockPrisma.workspaceMember.findUnique.mockResolvedValue(null);
    const socket = register();
    const ack = vi.fn();

    socket.handlers.get('subscribe:project')!(
      { projectId: 'p9', workspaceId: 'w-foreign' },
      ack,
    );
    await flush();

    expect(socket.join).not.toHaveBeenCalledWith('workspace:w-foreign');
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it('rejects malformed payloads', async () => {
    const socket = register();
    const ack = vi.fn();

    socket.handlers.get('subscribe:project')!({}, ack);
    await flush();

    expect(ack).toHaveBeenCalledWith({ ok: false });
    expect(socket.join).toHaveBeenCalledTimes(1); // user room only
  });

  it('acks ok:false when the access check throws', async () => {
    mockPrisma.project.findUnique.mockRejectedValue(new Error('db down'));
    const socket = register();
    const ack = vi.fn();

    socket.handlers.get('subscribe:project')!({ projectId: 'p9' }, ack);
    await flush();

    expect(ack).toHaveBeenCalledWith({ ok: false });
  });
});

describe('unsubscribe:project', () => {
  it('leaves the room for a valid payload', () => {
    const socket = register();
    socket.handlers.get('unsubscribe:project')!({ projectId: 'p1' });
    expect(socket.leave).toHaveBeenCalledWith('project:p1');
  });

  it('ignores malformed payloads', () => {
    const socket = register();
    socket.handlers.get('unsubscribe:project')!(undefined);
    socket.handlers.get('unsubscribe:project')!({});
    expect(socket.leave).not.toHaveBeenCalled();
  });
});

describe('typing events', () => {
  it('drops typing events for rooms the socket has not joined', () => {
    const socket = register();
    socket.handlers.get('typing:start')!({ taskId: 't1', projectId: 'p1' });
    expect(socket.to).not.toHaveBeenCalled();
  });

  it('relays typing events for joined rooms', () => {
    const socket = register();
    socket.rooms.add('project:p1');
    socket.handlers.get('typing:start')!({ taskId: 't1', projectId: 'p1' });
    expect(socket.to).toHaveBeenCalledWith('project:p1');
  });
});
