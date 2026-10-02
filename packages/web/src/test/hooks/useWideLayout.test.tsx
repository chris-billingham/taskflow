import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLayoutWidth, useWideLayout } from '@/hooks/useWideLayout';

describe('useWideLayout', () => {
  it('widens the main column while a wide view is showing, and puts it back after', () => {
    const { rerender, unmount } = renderHook(({ active }) => useWideLayout(active), { initialProps: { active: true } });
    expect(useLayoutWidth.getState().wide).toBe(true);
    rerender({ active: false });
    expect(useLayoutWidth.getState().wide).toBe(false);
    rerender({ active: true });
    unmount();
    expect(useLayoutWidth.getState().wide).toBe(false);
  });
});
