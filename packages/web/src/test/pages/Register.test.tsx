import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { mockApi } from '../mocks/api';
import Register from '@/pages/auth/Register';
import { useAuthStore } from '@/stores/authStore';

function respondToRegister(data: Record<string, unknown>) {
  mockApi.post.mockImplementation(async (url: string) => {
    if (url === '/auth/register') return { data: { success: true, data } };
    throw new Error(`unexpected POST ${url}`);
  });
}

async function fillAndSubmit() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/today" element={<p>Today page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  await user.type(screen.getByLabelText('Name'), 'Grace Hopper');
  await user.type(screen.getByLabelText('Email'), 'grace@example.com');
  await user.type(screen.getByLabelText('Password'), 'correct-horse-9');
  await user.type(screen.getByLabelText('Confirm password'), 'correct-horse-9');
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
});

describe('Register', () => {
  it('asks the user to verify their email instead of signing them in', async () => {
    respondToRegister({
      user: { id: 'u1', email: 'grace@example.com', name: 'Grace Hopper' },
      verificationRequired: true,
    });

    await fillAndSubmit();

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('grace@example.com')).toBeInTheDocument();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('signs the user straight in when no verification is needed', async () => {
    respondToRegister({
      user: { id: 'u1', email: 'grace@example.com', name: 'Grace Hopper' },
      accessToken: 'access-token',
      verificationRequired: false,
    });

    await fillAndSubmit();

    expect(await screen.findByText('Today page')).toBeInTheDocument();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
