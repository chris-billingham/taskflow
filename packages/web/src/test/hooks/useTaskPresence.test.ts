import { mockSocket } from '../mocks/socket';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { getSocket, leaveTask, viewTask } from '@/services/socket';
import { useTaskPresence } from '@/hooks/useTaskPresence';
import { useSocketStore } from '@/stores/socketStore';
import { useAuthStore } from '@/stores/authStore';
import { resetStores } from '../helpers/renderPage';
import { TEST_USER } from '../msw/fixtures';

type Handler = (payload: unknown) => void;
const handlers = new Map<string, Handler>();

beforeEach(() => {
  resetStores();
  vi.clearAllMocks();
  handlers.clear();
  mockSocket.on.mockImplementation((event: string, fn: Handler) => handlers.set(event, fn));
  vi.mocked(getSocket).mockReturnValue(mockSocket as never);
  useAuthStore.setState({ user: TEST_USER, isAuthenticated: true, isLoading: false });
  useSocketStore.setState({ status: 'connected' });
});

describe('useTaskPresence', () => {
  it('announces the open task and lists the other people viewing it', () => {
    const { result, unmount } = renderHook(() => useTaskPresence('t1'));
    expect(viewTask).toHaveBeenCalledWith('t1');

    act(() =>
      handlers.get('task:viewers')!({
        taskId: 't1',
        users: [
          { id: TEST_USER.id, name: TEST_USER.name },
          { id: 'u2', name: 'Grace' },
        ],
      }),
    );
    expect(result.current).toEqual([{ id: 'u2', name: 'Grace' }]);

    // Another task's viewers don't count.
    act(() => handlers.get('task:viewers')!({ taskId: 't9', users: [{ id: 'u3', name: 'Linus' }] }));
    expect(result.current).toEqual([{ id: 'u2', name: 'Grace' }]);

    unmount();
    expect(leaveTask).toHaveBeenCalledWith('t1');
  });

  it('announces again after a reconnect', () => {
    renderHook(() => useTaskPresence('t1'));
    act(() => useSocketStore.setState({ status: 'disconnected' }));
    act(() => useSocketStore.setState({ status: 'connected' }));
    expect(viewTask).toHaveBeenCalledTimes(2);
  });
});
