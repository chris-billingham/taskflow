import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(() => null),
}));

import { useAuthStore } from '@/stores/authStore';
import api, { setAccessToken } from '@/services/api';

const mockApi = api as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

const MOCK_USER = { id: 'u1', email: 'test@example.com', name: 'Test User' };
const MOCK_TOKENS = {
  accessToken: 'access-token-value',
  refreshToken: 'refresh-token-value',
};

function getStore() {
  return renderHook(() => useAuthStore()).result;
}

beforeEach(() => {
  // Reset store state between tests
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });
  localStorage.clear();
});

describe('authStore - login', () => {
  it('sets user and isAuthenticated on successful login', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: { data: { user: MOCK_USER, ...MOCK_TOKENS } },
    });

    const store = getStore();
    await act(async () => {
      await store.current.login('test@example.com', 'password');
    });

    expect(store.current.user).toMatchObject(MOCK_USER);
    expect(store.current.isAuthenticated).toBe(true);
    expect(store.current.isLoading).toBe(false);
  });

  it('stores refreshToken in localStorage', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: { data: { user: MOCK_USER, ...MOCK_TOKENS } },
    });

    const store = getStore();
    await act(async () => {
      await store.current.login('test@example.com', 'password');
    });

    expect(localStorage.getItem('refreshToken')).toBe(MOCK_TOKENS.refreshToken);
  });

  it('calls setAccessToken with the access token', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: { data: { user: MOCK_USER, ...MOCK_TOKENS } },
    });

    const store = getStore();
    await act(async () => {
      await store.current.login('test@example.com', 'password');
    });

    expect(vi.mocked(setAccessToken)).toHaveBeenCalledWith(MOCK_TOKENS.accessToken);
  });

  it('throws when API call fails', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('Invalid credentials'));

    const store = getStore();
    await expect(
      act(async () => {
        await store.current.login('bad@example.com', 'wrong');
      }),
    ).rejects.toThrow();
  });
});

describe('authStore - register', () => {
  it('sets user and isAuthenticated on successful registration', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: { data: { user: MOCK_USER, ...MOCK_TOKENS } },
    });

    const store = getStore();
    await act(async () => {
      await store.current.register('Test User', 'test@example.com', 'password');
    });

    expect(store.current.user).toMatchObject(MOCK_USER);
    expect(store.current.isAuthenticated).toBe(true);
  });
});

describe('authStore - logout', () => {
  it('clears user state and localStorage', async () => {
    // Set up authenticated state
    useAuthStore.setState({ user: MOCK_USER, isAuthenticated: true });
    localStorage.setItem('refreshToken', 'some-token');

    mockApi.post.mockResolvedValueOnce({ data: {} });

    const store = getStore();
    await act(async () => {
      await store.current.logout();
    });

    expect(store.current.user).toBeNull();
    expect(store.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('clears state even if logout API call fails', async () => {
    useAuthStore.setState({ user: MOCK_USER, isAuthenticated: true });
    localStorage.setItem('refreshToken', 'some-token');

    mockApi.post.mockRejectedValueOnce(new Error('Network error'));

    const store = getStore();
    await act(async () => {
      await store.current.logout();
    });

    expect(store.current.user).toBeNull();
    expect(store.current.isAuthenticated).toBe(false);
  });
});

describe('authStore - updateUser', () => {
  it('merges partial updates into the user object', () => {
    useAuthStore.setState({ user: MOCK_USER });

    const store = getStore();
    act(() => {
      store.current.updateUser({ name: 'Updated Name' });
    });

    expect(store.current.user?.name).toBe('Updated Name');
    expect(store.current.user?.email).toBe(MOCK_USER.email);
  });

  it('does nothing when user is null', () => {
    useAuthStore.setState({ user: null });

    const store = getStore();
    act(() => {
      store.current.updateUser({ name: 'Should not update' });
    });

    expect(store.current.user).toBeNull();
  });
});

describe('authStore - initialize', () => {
  it('sets isLoading to false when no refresh token in localStorage', async () => {
    localStorage.removeItem('refreshToken');

    const store = getStore();
    await act(async () => {
      await store.current.initialize();
    });

    expect(store.current.isLoading).toBe(false);
    expect(store.current.isAuthenticated).toBe(false);
  });

  it('refreshes access token and fetches user when refresh token exists', async () => {
    localStorage.setItem('refreshToken', 'stored-refresh-token');

    mockApi.post.mockResolvedValueOnce({
      data: { data: { accessToken: 'new-access', refreshToken: 'new-refresh' } },
    });
    mockApi.get.mockResolvedValueOnce({
      data: { data: MOCK_USER },
    });

    const store = getStore();
    await act(async () => {
      await store.current.initialize();
    });

    expect(store.current.isAuthenticated).toBe(true);
    expect(store.current.user).toMatchObject(MOCK_USER);
    expect(store.current.isLoading).toBe(false);
  });

  it('clears auth state when refresh fails', async () => {
    localStorage.setItem('refreshToken', 'invalid-token');
    mockApi.post.mockRejectedValueOnce(new Error('Token expired'));

    const store = getStore();
    await act(async () => {
      await store.current.initialize();
    });

    expect(store.current.isAuthenticated).toBe(false);
    expect(store.current.user).toBeNull();
    expect(store.current.isLoading).toBe(false);
  });
});
