import '../mocks/socket';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { reportMutationError } from '@/utils/reportError';
import { useToastStore } from '@/stores/toastStore';

afterEach(() => vi.restoreAllMocks());

describe('offline', () => {
  it('shows the banner while there is no connection', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<OfflineBanner />);
    expect(screen.queryByText(/You're offline/)).not.toBeInTheDocument();

    onLine.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(/You're offline/)).toBeInTheDocument();
  });

  it('says a failed save was because of the connection', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    reportMutationError(new Error('Network Error'), 'That change could not be saved');
    const toasts = useToastStore.getState().toasts;
    expect(toasts.at(-1)?.message).toMatch(/You're offline/);
  });
});
