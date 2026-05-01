import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api, { setAccessToken } from '@/services/api';

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  timezone?: string;
  weekStart?: number;
  dateFormat?: string | null;
  timeFormat?: string | null;
  theme?: string | null;
  emailVerified?: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
  initialize: () => Promise<void>;
}

// Deduplicates concurrent initialize() calls so that React StrictMode's
// double-fired effect doesn't send the same refresh token twice (which
// triggers the API's reuse-detection and invalidates all tokens).
let initPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (email: string, password: string) => {
        const { data } = await api.post('/auth/login', { email, password });
        const { user, accessToken } = data.data;

        setAccessToken(accessToken);
        // Refresh token is set as an httpOnly cookie by the server
        set({ user, isAuthenticated: true, isLoading: false });
      },

      register: async (name: string, email: string, password: string) => {
        const { data } = await api.post('/auth/register', {
          name,
          email,
          password,
        });
        const { user, accessToken } = data.data;

        setAccessToken(accessToken);
        // Refresh token is set as an httpOnly cookie by the server
        set({ user, isAuthenticated: true, isLoading: false });
      },

      logout: async () => {
        try {
          // Server will read the refresh token from its httpOnly cookie and revoke it
          await api.post('/auth/logout', {});
        } catch {
          // Ignore logout errors
        } finally {
          setAccessToken(null);
          set({ user: null, isAuthenticated: false });
        }
      },

      refreshToken: async () => {
        // Refresh token is in an httpOnly cookie — no body needed
        const { data } = await api.post('/auth/refresh', {});
        const { accessToken } = data.data;
        setAccessToken(accessToken);
      },

      updateUser: (data: Partial<User>) => {
        const { user } = get();
        if (user) {
          set({ user: { ...user, ...data } });
        }
      },

      initialize: async () => {
        // Return the in-flight promise so concurrent calls (e.g. from
        // StrictMode double-firing useEffect) share one request.
        if (initPromise) return initPromise;

        initPromise = (async () => {
          try {
            // Attempt to refresh using the httpOnly cookie; if no cookie
            // exists the server returns 401 and we fall through to unauthenticated.
            const { data } = await api.post('/auth/refresh', {});
            const { accessToken } = data.data;

            setAccessToken(accessToken);

            const userResponse = await api.get('/users/me');

            set({
              user: userResponse.data.data,
              isAuthenticated: true,
              isLoading: false,
            });
          } catch {
            setAccessToken(null);
            set({ user: null, isAuthenticated: false, isLoading: false });
          }
        })();

        try {
          await initPromise;
        } finally {
          initPromise = null;
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
