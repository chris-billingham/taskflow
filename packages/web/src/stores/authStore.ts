import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api, { setAccessToken } from '@/services/api';

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
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

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (email: string, password: string) => {
        const { data } = await api.post('/auth/login', { email, password });
        const { user, accessToken, refreshToken } = data.data;

        setAccessToken(accessToken);
        localStorage.setItem('refreshToken', refreshToken);

        set({ user, isAuthenticated: true });
      },

      register: async (name: string, email: string, password: string) => {
        const { data } = await api.post('/auth/register', {
          name,
          email,
          password,
        });
        const { user, accessToken, refreshToken } = data.data;

        setAccessToken(accessToken);
        localStorage.setItem('refreshToken', refreshToken);

        set({ user, isAuthenticated: true });
      },

      logout: async () => {
        try {
          const refreshToken = localStorage.getItem('refreshToken');
          if (refreshToken) {
            await api.post('/auth/logout', { refreshToken });
          }
        } catch {
          // Ignore logout errors
        } finally {
          setAccessToken(null);
          localStorage.removeItem('refreshToken');
          set({ user: null, isAuthenticated: false });
        }
      },

      refreshToken: async () => {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await api.post('/auth/refresh', { refreshToken });
        const { accessToken, refreshToken: newRefreshToken } = data.data;

        setAccessToken(accessToken);
        localStorage.setItem('refreshToken', newRefreshToken);
      },

      updateUser: (data: Partial<User>) => {
        const { user } = get();
        if (user) {
          set({ user: { ...user, ...data } });
        }
      },

      initialize: async () => {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          set({ isLoading: false, isAuthenticated: false });
          return;
        }

        try {
          // Refresh access token
          const { data } = await api.post('/auth/refresh', { refreshToken });
          const { accessToken, refreshToken: newRefreshToken } = data.data;

          setAccessToken(accessToken);
          localStorage.setItem('refreshToken', newRefreshToken);

          // Fetch current user profile
          const userResponse = await api.get('/users/me');

          set({
            user: userResponse.data.data,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          setAccessToken(null);
          localStorage.removeItem('refreshToken');
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
