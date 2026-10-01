import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({
  prisma: {
    project: { findMany: vi.fn(async () => [{ id: 'p-kept' }, { id: 'p-new' }]) },
    workspaceMember: { findMany: vi.fn(async () => [{ workspaceId: 'ws-1' }]) },
  },
}));
vi.mock('../../websocket/presence.js', () => ({ updatePresence: vi.fn(), removePresence: vi.fn() }));

const socket = {
  rooms: new Set(['sock-id', 'user:u1', 'project:p-kept', 'project:p-lost', 'workspace:ws-old']),
  join: vi.fn(),
  leave: vi.fn(),
};
const inRoom = vi.fn(() => ({ fetchSockets: async () => [socket] }));
vi.mock('../../websocket/events.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../websocket/events.js')>()),
  getIO: () => ({ in: inRoom }),
}));

import { refreshUserRooms } from '../../websocket/handlers.js';

describe('refreshUserRooms', () => {
  it('joins rooms the user has gained and leaves the ones they lost', async () => {
    await refreshUserRooms('u1');

    expect(inRoom).toHaveBeenCalledWith('user:u1');
    expect(socket.leave.mock.calls.map(([room]) => room).sort()).toEqual(['project:p-lost', 'workspace:ws-old']);
    // Its own room and the user room are never touched.
    expect(socket.leave).not.toHaveBeenCalledWith('user:u1');
    expect(socket.join).toHaveBeenCalledWith(expect.arrayContaining(['workspace:ws-1', 'project:p-kept', 'project:p-new']));
  });
});
