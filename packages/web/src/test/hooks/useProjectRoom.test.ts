import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/services/socket', () => ({
  subscribeToProject: vi.fn(),
  unsubscribeFromProject: vi.fn(),
}));

import { subscribeToProject, unsubscribeFromProject } from '@/services/socket';
import { useProjectRoom } from '@/hooks/useProjectRoom';
import { useSocketStore } from '@/stores/socketStore';

beforeEach(() => {
  vi.clearAllMocks();
  useSocketStore.setState({ status: 'disconnected' });
});

describe('useProjectRoom', () => {
  it('subscribes on mount and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useProjectRoom('p1', 'w1'));
    expect(subscribeToProject).toHaveBeenCalledWith('p1', 'w1');

    unmount();
    expect(unsubscribeFromProject).toHaveBeenCalledWith('p1');
  });

  it('does nothing without a project id', () => {
    renderHook(() => useProjectRoom(undefined, 'w1'));
    expect(subscribeToProject).not.toHaveBeenCalled();
  });

  it('re-subscribes when the project changes', () => {
    const { rerender } = renderHook(({ id }) => useProjectRoom(id, 'w1'), {
      initialProps: { id: 'p1' },
    });
    rerender({ id: 'p2' });

    expect(unsubscribeFromProject).toHaveBeenCalledWith('p1');
    expect(subscribeToProject).toHaveBeenLastCalledWith('p2', 'w1');
  });
});
