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
  refreshAccessToken: vi.fn(),
}));

vi.mock('@/services/socket', () => ({
  disconnectSocket: vi.fn(),
  initSocket: vi.fn(),
  getSocket: vi.fn(() => null),
}));

import { useAuthStore } from '@/stores/authStore';
import { refreshAccessToken } from '@/services/api';

const mockRefreshAccessToken = vi.mocked(refreshAccessToken);
import api, { setAccessToken } from '@/services/api';

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

const MOCK_USER = { id: 'u1', email: 'test@example.com', name: 'Test User' };
const MOCK_TOKENS = {
  accessToken: 'access-token-value',
  // refreshToken is now an httpOnly cookie set by the server — not in the response body
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
  vi.clearAllMocks();
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

  it('does not write refresh token to localStorage (cookie-only)', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: { data: { user: MOCK_USER, ...MOCK_TOKENS } },
    });

    const store = getStore();
    await act(async () => {
      await store.current.login('test@example.com', 'password');
    });

    expect(localStorage.getItem('refreshToken')).toBeNull();
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
  it('clears user state on logout', async () => {
    useAuthStore.setState({ user: MOCK_USER, isAuthenticated: true });
    mockApi.post.mockResolvedValueOnce({ data: {} });

    const store = getStore();
    await act(async () => {
      await store.current.logout();
    });

    expect(store.current.user).toBeNull();
    expect(store.current.isAuthenticated).toBe(false);
  });

  it('clears state even if logout API call fails', async () => {
    useAuthStore.setState({ user: MOCK_USER, isAuthenticated: true });
    mockApi.post.mockRejectedValueOnce(new Error('Network error'));

    const store = getStore();
    await act(async () => {
      await store.current.logout();
    });

    expect(store.current.user).toBeNull();
    expect(store.current.isAuthenticated).toBe(false);
  });

  it('calls POST /auth/logout without a body refresh token', async () => {
    useAuthStore.setState({ user: MOCK_USER, isAuthenticated: true });
    mockApi.post.mockResolvedValueOnce({ data: {} });

    const store = getStore();
    await act(async () => {
      await store.current.logout();
    });

    expect(mockApi.post).toHaveBeenCalledWith('/auth/logout', {});
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
  it('sets isAuthenticated when cookie-based refresh succeeds', async () => {
    // initialize() refreshes through the shared cross-tab-locked helper
    mockRefreshAccessToken.mockResolvedValueOnce('new-access');
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

  it('clears auth state when refresh fails (no valid cookie)', async () => {
    mockRefreshAccessToken.mockResolvedValueOnce(null);

    const store = getStore();
    await act(async () => {
      await store.current.initialize();
    });

    expect(store.current.isAuthenticated).toBe(false);
    expect(store.current.user).toBeNull();
    expect(store.current.isLoading).toBe(false);
  });
});
