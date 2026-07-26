import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  setAccessToken: vi.fn(),
}));

import { useTasks, useTodayView, useUpcomingView } from '@/hooks/useTasks';
import { useTaskStore } from '@/stores/taskStore';
import { useSocketStore } from '@/stores/socketStore';

// The wiring between "the socket is receiving again" and "re-read the view".
// Thin enough to get silently wrong via a dependency array, and nothing else
// would notice: the app would simply go on showing stale data.

let fetchTasks: ReturnType<typeof vi.fn>;
let resyncTasks: ReturnType<typeof vi.fn>;
let fetchTodayView: ReturnType<typeof vi.fn>;
let fetchUpcomingView: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchTasks = vi.fn().mockResolvedValue(undefined);
  resyncTasks = vi.fn().mockResolvedValue(undefined);
  fetchTodayView = vi.fn().mockResolvedValue(undefined);
  fetchUpcomingView = vi.fn().mockResolvedValue(undefined);

  useTaskStore.setState({
    tasks: new Map(),
    fetchTasks,
    resyncTasks,
    fetchTodayView,
    fetchUpcomingView,
  } as never);
  useSocketStore.setState({ resyncEpoch: 0 });
});

function bumpResync() {
  act(() => useSocketStore.getState().bumpResync());
}

describe('useTasks resync', () => {
  it('fetches once on mount and not again without a signal', async () => {
    renderHook(() => useTasks({ projectId: 'p1' }));

    await waitFor(() => expect(fetchTasks).toHaveBeenCalledTimes(1));
    expect(resyncTasks).not.toHaveBeenCalled();
  });

  it('resyncs when the socket signals, preserving pagination', async () => {
    renderHook(() => useTasks({ projectId: 'p1' }));
    await waitFor(() => expect(fetchTasks).toHaveBeenCalledTimes(1));

    bumpResync();

    // resyncTasks, not fetchTasks: the latter would reset to page one.
    await waitFor(() => expect(resyncTasks).toHaveBeenCalledTimes(1));
    expect(resyncTasks).toHaveBeenCalledWith({ projectId: 'p1' });
    expect(fetchTasks).toHaveBeenCalledTimes(1);
  });

  it('resyncs with the CURRENT query after a project switch', async () => {
    const { rerender } = renderHook(({ id }) => useTasks({ projectId: id }), {
      initialProps: { id: 'p1' },
    });
    rerender({ id: 'p2' });

    bumpResync();

    await waitFor(() => expect(resyncTasks).toHaveBeenCalledWith({ projectId: 'p2' }));
  });

  it('does not double-fetch when the project changes', async () => {
    // The resync effect reads the query through a ref precisely so it does not
    // fire alongside the mount effect on every navigation.
    const { rerender } = renderHook(({ id }) => useTasks({ projectId: id }), {
      initialProps: { id: 'p1' },
    });
    await waitFor(() => expect(fetchTasks).toHaveBeenCalledTimes(1));

    rerender({ id: 'p2' });

    await waitFor(() => expect(fetchTasks).toHaveBeenCalledTimes(2));
    expect(resyncTasks).not.toHaveBeenCalled();
  });

  it('resyncs again on each subsequent signal', async () => {
    renderHook(() => useTasks({ projectId: 'p1' }));
    bumpResync();
    await waitFor(() => expect(resyncTasks).toHaveBeenCalledTimes(1));
    bumpResync();
    await waitFor(() => expect(resyncTasks).toHaveBeenCalledTimes(2));
  });
});

describe('view resync', () => {
  it('re-reads the Today view on a signal', async () => {
    renderHook(() => useTodayView());
    await waitFor(() => expect(fetchTodayView).toHaveBeenCalledTimes(1));

    bumpResync();

    // These views have no pagination to preserve, so the ordinary fetch IS the
    // resync — hence a second call rather than a separate action.
    await waitFor(() => expect(fetchTodayView).toHaveBeenCalledTimes(2));
  });

  it('re-reads the Upcoming view on a signal, keeping its arguments', async () => {
    renderHook(() => useUpcomingView(7, false));
    await waitFor(() => expect(fetchUpcomingView).toHaveBeenCalledTimes(1));

    bumpResync();

    await waitFor(() => expect(fetchUpcomingView).toHaveBeenCalledTimes(2));
    expect(fetchUpcomingView).toHaveBeenLastCalledWith(7, false);
  });
});
