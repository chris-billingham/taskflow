import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
