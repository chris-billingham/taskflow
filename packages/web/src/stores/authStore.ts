import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api, { setAccessToken, refreshAccessToken } from '@/services/api';
import { disconnectSocket } from '@/services/socket';

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

// The server computes Today/Upcoming and parses "today" in the user's stored
// timezone. Backfill it from the browser once, but ONLY while it's still the
// server default (UTC) — a deliberately chosen timezone is never overridden.
function syncBrowserTimezone(
  user: User | null,
  updateUser: (data: Partial<User>) => void,
): void {
  try {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!user || !browserTz || browserTz === 'UTC' || user.timezone !== 'UTC') {
      return;
    }
    void api.patch('/users/me', { timezone: browserTz }).then(() => {
      updateUser({ timezone: browserTz });
    }).catch(() => {
      /* cosmetic; next login retries */
    });
  } catch {
    /* Intl unavailable — keep UTC */
  }
}

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
        syncBrowserTimezone(user, get().updateUser);
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
          disconnectSocket();
          set({ user: null, isAuthenticated: false });
          // A full reload is the only reliable session boundary: every store
          // (tasks, projects, notifications, workspace…) holds the previous
          // user's data in memory, and several persist to localStorage. On a
          // shared machine the next sign-in briefly saw all of it.
          for (const key of [
            'auth-storage',
            'workspace-storage',
            'taskflow-ui',
            'taskflow:recent-searches',
          ]) {
            localStorage.removeItem(key);
          }
          window.location.href = '/login';
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
            // Refresh through the shared (cross-tab-locked) path: two tabs
            // restoring simultaneously used to send the same single-use
            // cookie twice and trip reuse detection.
            const accessToken = await refreshAccessToken();
            if (!accessToken) {
              throw new Error('no session');
            }

            const userResponse = await api.get('/users/me');

            set({
              user: userResponse.data.data,
              isAuthenticated: true,
              isLoading: false,
            });
            syncBrowserTimezone(userResponse.data.data, get().updateUser);
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
