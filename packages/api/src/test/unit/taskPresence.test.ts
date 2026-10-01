import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database.js', () => ({
  prisma: {
    project: { findMany: vi.fn(async () => []) },
    workspaceMember: { findMany: vi.fn(async () => []) },
  },
}));

const canSee = vi.hoisted(() => ({ allowed: true }));
vi.mock('../../services/access.js', () => ({
  hasProjectAccess: vi.fn(),
  hasWorkspaceAccess: vi.fn(),
  projectAccessWhere: vi.fn(() => ({})),
  requireTaskAccess: vi.fn(async () => {
    if (!canSee.allowed) throw new Error('Forbidden');
    return {};
  }),
}));

// The sockets in task:t1 across every instance, and what was sent to the room.
const roomSockets = vi.hoisted(() => [] as { data: { user: { id: string; name: string } } }[]);
const roomEmit = vi.hoisted(() => vi.fn());
vi.mock('../../websocket/events.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../websocket/events.js')>()),
  getIO: () => ({
    in: () => ({ fetchSockets: async () => roomSockets }),
    to: () => ({ emit: roomEmit }),
  }),
}));

import { registerHandlers } from '../../websocket/handlers.js';

function connect(user: { id: string; name: string }) {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    data: { user: { ...user, email: `${user.id}@x.test` } },
    connected: true,
    rooms: new Set<string>(),
    join: vi.fn(async (room: string | string[]) => {
      for (const r of [room].flat()) socket.rooms.add(r);
    }),
    leave: vi.fn(async (room: string) => {
      socket.rooms.delete(room);
    }),
    emit: vi.fn(),
    to: vi.fn(() => ({ emit: vi.fn() })),
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => handlers.set(event, fn)),
    once: vi.fn(),
  };
  registerHandlers(socket as never);
  return { socket, handlers };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  canSee.allowed = true;
  roomSockets.length = 0;
});

describe('who has a task open', () => {
  it('opening a task joins its room and tells everyone there who is viewing', async () => {
    const { socket, handlers } = connect({ id: 'u1', name: 'Ada' });
    roomSockets.push({ data: { user: { id: 'u2', name: 'Grace' } } }, { data: { user: { id: 'u1', name: 'Ada' } } });

    handlers.get('task:view')!({ taskId: 't1' });
    await flush();

    expect(socket.join).toHaveBeenCalledWith('task:t1');
    expect(roomEmit).toHaveBeenCalledWith('task:viewers', {
      taskId: 't1',
      users: [
        { id: 'u2', name: 'Grace' },
        { id: 'u1', name: 'Ada' },
      ],
    });
  });

  it('ignores a task you cannot see', async () => {
    canSee.allowed = false;
    const { socket, handlers } = connect({ id: 'u1', name: 'Ada' });
    handlers.get('task:view')!({ taskId: 't1' });
    await flush();
    expect(socket.join).not.toHaveBeenCalledWith('task:t1');
    expect(roomEmit).not.toHaveBeenCalled();
  });

  it('closing the task leaves the room and updates the others', async () => {
    const { socket, handlers } = connect({ id: 'u1', name: 'Ada' });
    socket.rooms.add('task:t1');
    handlers.get('task:leave')!({ taskId: 't1' });
    await flush();
    expect(socket.leave).toHaveBeenCalledWith('task:t1');
    expect(roomEmit).toHaveBeenCalledWith('task:viewers', { taskId: 't1', users: [] });
  });
});
