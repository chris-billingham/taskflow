import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { mockApi } from '../mocks/api';
import Login from '@/pages/auth/Login';

function rejectLogin(error: string, message: string) {
  mockApi.post.mockImplementation(async (url: string) => {
    if (url === '/auth/login') {
      throw { response: { status: 401, data: { success: false, error, message } } };
    }
    return { data: { success: true } };
  });
}

async function submit(email = 'new@example.com') {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), 'hunter22');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  return user;
}

function serveRegistration(open: boolean) {
  mockApi.get.mockImplementation(async (url: string) => {
    if (url === '/auth/registration') {
      return { data: { success: true, data: { mode: open ? 'open' : 'invite', open } } };
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  serveRegistration(true);
});

describe('Login — unverified email', () => {
  it('offers a resend link and posts the typed email to it', async () => {
    rejectLogin('EMAIL_NOT_VERIFIED', 'Please verify your email address before signing in');
    const user = await submit('new@example.com');

    const resend = await screen.findByRole('button', { name: 'Resend verification email' });
    await user.click(resend);

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/auth/resend-verification', {
        email: 'new@example.com',
      }),
    );
    expect(await screen.findByText(/a new link is on its way/)).toBeInTheDocument();
  });

  it('does not offer a resend for an ordinary bad password', async () => {
    rejectLogin('UNAUTHORIZED', 'Invalid email or password');
    await submit();

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resend verification email' })).toBeNull();
  });
});

describe('Login — sign-up link', () => {
  function renderLogin() {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
  }

  it('offers sign-up when registration is open', async () => {
    renderLogin();
    expect(await screen.findByRole('link', { name: 'Sign up' })).toBeInTheDocument();
  });

  it('explains invitation-only sign-up instead of linking to it', async () => {
    serveRegistration(false);
    renderLogin();
    expect(await screen.findByText(/New accounts are by invitation/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign up' })).toBeNull();
  });

  it('still offers sign-up to someone holding an invitation', async () => {
    serveRegistration(false);
    sessionStorage.setItem('taskflow.pendingInvite', 'invite-123');
    renderLogin();
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/auth/registration'));
    expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
  });
});

describe('Login — two-factor sign-in', () => {
  const SIGNED_IN = {
    user: { id: 'u1', email: 'sam@example.com', name: 'Sam', role: 'USER', isActive: true },
    accessToken: 'access',
  };

  function serveTwoFactor(secondStep: (body: Record<string, string>) => unknown) {
    mockApi.post.mockImplementation(async (url: string, body: Record<string, string>) => {
      if (url === '/auth/login') return { data: { success: true, data: { twoFactorRequired: true, challengeToken: 'challenge' } } };
      if (url === '/auth/login/two-factor') return secondStep(body);
      return { data: { success: true } };
    });
  }

  it('asks for a code after the password and signs in with it', async () => {
    serveTwoFactor(() => ({ data: { success: true, data: SIGNED_IN } }));
    const user = await submit('sam@example.com');
    await user.type(await screen.findByLabelText('Code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/auth/login/two-factor', { challengeToken: 'challenge', code: '123456' }),
    );
  });

  it('accepts a recovery code instead', async () => {
    serveTwoFactor(() => ({ data: { success: true, data: SIGNED_IN } }));
    const user = await submit('sam@example.com');
    await user.click(await screen.findByRole('button', { name: 'Use a recovery code instead' }));
    await user.type(screen.getByLabelText('Recovery code'), 'abcde-23456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/auth/login/two-factor', {
        challengeToken: 'challenge',
        recoveryCode: 'abcde-23456',
      }),
    );
  });

  it('says when a code is wrong and lets you try again', async () => {
    serveTwoFactor(() => {
      throw { response: { status: 401, data: { error: 'INVALID_TWO_FACTOR_CODE', message: "That code isn't right." } } };
    });
    const user = await submit('sam@example.com');
    await user.type(await screen.findByLabelText('Code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText("That code isn't right.")).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toHaveValue('');
  });

  it('goes back to the password when the challenge has expired', async () => {
    serveTwoFactor(() => {
      throw { response: { status: 401, data: { error: 'CHALLENGE_EXPIRED', message: 'That sign-in took too long. Enter your password again.' } } };
    });
    const user = await submit('sam@example.com');
    await user.type(await screen.findByLabelText('Code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText(/took too long/)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });
});
