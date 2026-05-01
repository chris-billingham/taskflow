import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAccessToken: vi.fn(),
}));

import { useAuth, useRequireAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';

const Wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(MemoryRouter, null, children);

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  });
});

describe('useAuth', () => {
  it('returns the auth store state', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('reflects authenticated state when user is set', () => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'user@example.com', name: 'User' },
      isAuthenticated: true,
    });

    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('user@example.com');
  });

  it('exposes login, logout, register actions', () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.login).toBe('function');
    expect(typeof result.current.logout).toBe('function');
    expect(typeof result.current.register).toBe('function');
  });
});

describe('useRequireAuth', () => {
  it('returns isAuthenticated and isLoading', () => {
    useAuthStore.setState({ isAuthenticated: true, isLoading: false });

    const { result } = renderHook(() => useRequireAuth(), { wrapper: Wrapper });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });
});
