import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockApi } from '../mocks/api';
import { TwoFactorSettings } from '@/components/settings/TwoFactorSettings';

const CODES = Array.from({ length: 10 }, (_, i) => `abcd${i}-2345${i}`);
let enabled = false;

beforeEach(() => {
  enabled = false;
  mockApi.get.mockImplementation(async (url: string) => {
    if (url === '/auth/two-factor') {
      return {
        data: {
          success: true,
          data: { enabled, enabledAt: enabled ? '2026-10-02T09:00:00.000Z' : null, recoveryCodesLeft: enabled ? 10 : 0 },
        },
      };
    }
    throw new Error(`unexpected GET ${url}`);
  });
  mockApi.post.mockImplementation(async (url: string) => {
    if (url === '/auth/two-factor/setup') {
      return { data: { success: true, data: { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/x', qrCode: 'data:image/svg+xml;base64,PHN2Zy8+' } } };
    }
    if (url === '/auth/two-factor/enable') {
      enabled = true;
      return { data: { success: true, data: { recoveryCodes: CODES } } };
    }
    if (url === '/auth/two-factor/disable') {
      enabled = false;
      return { data: { success: true, message: 'off' } };
    }
    throw new Error(`unexpected POST ${url}`);
  });
});

const renderSettings = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TwoFactorSettings />
    </QueryClientProvider>,
  );

describe('TwoFactorSettings', () => {
  it('sets up with the password, a scanned QR code and a code, then shows recovery codes once', async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByRole('button', { name: 'Set up' }));
    await user.type(screen.getByLabelText('Enter your password to continue'), 'hunter22');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByAltText('QR code for your authenticator app')).toBeInTheDocument();
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Code from the app'), '123456');
    await user.click(screen.getByRole('button', { name: 'Turn on' }));

    const list = await screen.findByRole('list', { name: 'Recovery codes' });
    expect(list.querySelectorAll('li')).toHaveLength(10);
    await user.click(screen.getByRole('button', { name: 'I’ve saved them' }));
    expect(await screen.findByText(/10 of 10 recovery codes left/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Recovery codes' })).not.toBeInTheDocument();
  });

  it('turns off with the password and a recovery code', async () => {
    enabled = true;
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByRole('button', { name: 'Turn off' }));
    await user.type(screen.getByLabelText('Password'), 'hunter22');
    await user.type(screen.getByLabelText('Code from your app, or a recovery code'), 'abcd0-23450');
    await user.click(screen.getByRole('button', { name: 'Turn off two-factor sign-in' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/auth/two-factor/disable', { password: 'hunter22', recoveryCode: 'abcd0-23450' }),
    );
    expect(await screen.findByRole('button', { name: 'Set up' })).toBeInTheDocument();
  });
});
