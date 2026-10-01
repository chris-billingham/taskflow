import '../mocks/socket';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { emitTypingStart, emitTypingStop } from '@/services/socket';
import { useTypingSignal } from '@/hooks/useTypingSignal';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe('useTypingSignal', () => {
  it('signals at most every couple of seconds, and stops after a pause', () => {
    const { result } = renderHook(() => useTypingSignal('t1'));
    act(() => {
      result.current.typing();
      result.current.typing();
      vi.advanceTimersByTime(1000);
      result.current.typing();
    });
    expect(emitTypingStart).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(2600));
    expect(emitTypingStop).toHaveBeenCalledWith('t1');
  });

  it('stops when the comment is sent or the editor goes away', () => {
    const { result, unmount } = renderHook(() => useTypingSignal('t1'));
    act(() => result.current.typing());
    act(() => result.current.stop());
    expect(emitTypingStop).toHaveBeenCalledTimes(1);

    act(() => result.current.typing());
    unmount();
    expect(emitTypingStop).toHaveBeenCalledTimes(2);
  });

  it('says nothing without a task', () => {
    const { result } = renderHook(() => useTypingSignal(undefined));
    act(() => result.current.typing());
    expect(emitTypingStart).not.toHaveBeenCalled();
  });
});
