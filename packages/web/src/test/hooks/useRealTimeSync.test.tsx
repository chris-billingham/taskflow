import { mockSocket } from '../mocks/socket';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getSocket } from '@/services/socket';
import { useRealTimeSync } from '@/hooks/useRealTimeSync';
import { useAuthStore } from '@/stores/authStore';
import { useSocketStore } from '@/stores/socketStore';
import { taskKeys } from '@/queries/taskKeys';
import type { TaskPage } from '@/queries/taskCache';
import { createTestQueryClient, resetStores } from '../helpers/renderPage';
import { makeTask, TEST_USER } from '../msw/fixtures';

type Handler = (payload: unknown) => void;
const handlers = new Map<string, Handler>();

beforeEach(() => {
  resetStores();
  handlers.clear();
  mockSocket.on.mockImplementation((event: string, fn: Handler) => handlers.set(event, fn));
  vi.mocked(getSocket).mockReturnValue(mockSocket as never);
  useAuthStore.setState({ user: TEST_USER, isAuthenticated: true, isLoading: false });
});

function setup() {
  const qc = createTestQueryClient();
  const key = taskKeys.list({ projectId: 'project-1' });
  qc.setQueryData<InfiniteData<TaskPage>>(key, {
    pages: [{ tasks: [makeTask({ id: 't1', content: 'Old' }), makeTask({ id: 't2' })], nextCursor: null }],
    pageParams: [undefined],
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  renderHook(() => useRealTimeSync(), { wrapper });
  const ids = () => qc.getQueryData<InfiniteData<TaskPage>>(key)!.pages[0].tasks;
  return { qc, key, ids };
}

describe('useRealTimeSync', () => {
  it('applies a remote edit to every cached copy', () => {
    const { ids } = setup();
    act(() => handlers.get('task:updated')!({ task: makeTask({ id: 't1', content: 'New' }) }));
    expect(ids()[0].content).toBe('New');
  });

  it('removes a remotely deleted task', () => {
    const { ids } = setup();
    act(() => handlers.get('task:deleted')!({ taskId: 't1' }));
    expect(ids().map((t) => t.id)).toEqual(['t2']);
  });

  it('re-reads everything after a reconnect', () => {
    const { qc, key } = setup();
    expect(qc.getQueryState(key)!.isInvalidated).toBe(false);
    act(() => useSocketStore.getState().bumpResync());
    expect(qc.getQueryState(key)!.isInvalidated).toBe(true);
  });
});
