import { create } from 'zustand';
import api from '@/services/api';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;

  fetchNotifications: (unreadOnly?: boolean) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearNotifications: () => void;
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,

  fetchNotifications: async (unreadOnly = false) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get('/notifications', {
        params: { unreadOnly, limit: 50 },
      });
      set({
        notifications: data.data,
        unreadCount: data.unreadCount,
        loading: false,
      });
    } catch (err: any) {
      set({
        error: err.response?.data?.message || 'Failed to fetch notifications',
        loading: false,
      });
    }
  },

  markAsRead: async (notificationId) => {
    // Optimistic update
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n,
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));

    try {
      await api.post('/notifications/mark-read', { notificationId });
    } catch (err) {
      // Revert on failure
      get().fetchNotifications();
      throw err;
    }
  },

  markAllAsRead: async () => {
    const prev = get().notifications;
    const prevCount = get().unreadCount;

    // Optimistic update
    set((state) => ({
      notifications: state.notifications.map((n) => ({
        ...n,
        isRead: true,
        readAt: n.readAt || new Date().toISOString(),
      })),
      unreadCount: 0,
    }));

    try {
      await api.post('/notifications/mark-all-read');
    } catch (err) {
      // Revert on failure
      set({ notifications: prev, unreadCount: prevCount });
      throw err;
    }
  },

  clearNotifications: () => {
    set({ notifications: [], unreadCount: 0, loading: false, error: null });
  },
}));
