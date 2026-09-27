import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { mockApi } from '../mocks/api';
import VerifyEmail from '@/pages/auth/VerifyEmail';
import { JoinWorkspace } from '@/components/workspace/JoinWorkspace';
import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

function openAt(url: string) {
  window.history.replaceState(null, '', url);
}

function LoginProbe() {
  const location = useLocation();
  return <p>login page {location.search}</p>;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  openAt('/');
});

describe('VerifyEmail', () => {
  it('posts the fragment token in the body and scrubs it from the address bar', async () => {
    openAt('/verify-email#token=verify-me');
    mockApi.post.mockResolvedValue({ data: { success: true } });

    render(
      <MemoryRouter>
        <VerifyEmail />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/auth/verify-email', { token: 'verify-me' }),
    );
    expect(mockApi.get).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('verify-me');
  });
});

describe('JoinWorkspace', () => {
  it('keeps the invite token out of the login redirect URL', async () => {
    openAt('/join#token=invite-123');
    useAuthStore.setState({ isAuthenticated: false, isLoading: false });

    render(
      <MemoryRouter initialEntries={['/join']}>
        <Routes>
          <Route path="/join" element={<JoinWorkspace />} />
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    const probe = await screen.findByText(/login page/);
    expect(probe.textContent).toBe('login page ?redirect=%2Fjoin');
    expect(probe.textContent).not.toContain('invite-123');
    expect(sessionStorage.getItem('taskflow.pendingInvite')).toBe('invite-123');
  });

  it('accepts the held invite after sign-in and forgets it', async () => {
    sessionStorage.setItem('taskflow.pendingInvite', 'invite-123');
    const acceptInvite = vi.fn().mockResolvedValue(undefined);
    useWorkspaceStore.setState({ acceptInvite });
    useAuthStore.setState({ isAuthenticated: true, isLoading: false });

    render(
      <MemoryRouter initialEntries={['/join']}>
        <JoinWorkspace />
      </MemoryRouter>,
    );

    await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith('invite-123'));
    expect(await screen.findByText("You're in!")).toBeInTheDocument();
    expect(sessionStorage.getItem('taskflow.pendingInvite')).toBeNull();
  });
});
