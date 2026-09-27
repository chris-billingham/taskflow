import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type { Notification } from '@taskflow/contract';
import { reportMutationError } from '@/utils/reportError';

export type { Notification };

export const notificationKeys = { all: ['notifications'] as const };

interface NotificationList {
  notifications: Notification[];
  unreadCount: number;
}

/** The latest notifications and the unread count, re-read every 30 seconds. */
export function useNotifications() {
  const query = useQuery({
    queryKey: notificationKeys.all,
    queryFn: async (): Promise<NotificationList> => {
      const { data } = await api.get('/notifications', { params: { unreadOnly: false, limit: 50 } });
      return { notifications: data.data, unreadCount: data.unreadCount };
    },
    refetchInterval: 30_000,
  });
  return {
    notifications: query.data?.notifications ?? [],
    unreadCount: query.data?.unreadCount ?? 0,
    loading: query.isLoading,
  };
}

export function useNotificationActions() {
  const qc = useQueryClient();
  return useMemo(() => {
    async function change(apply: (list: NotificationList) => NotificationList, request: () => Promise<unknown>) {
      await qc.cancelQueries({ queryKey: notificationKeys.all });
      const previous = qc.getQueryData<NotificationList>(notificationKeys.all);
      if (previous) qc.setQueryData(notificationKeys.all, apply(previous));
      try {
        await request();
      } catch (err) {
        qc.setQueryData(notificationKeys.all, previous);
        reportMutationError(err, 'That change could not be saved');
        throw err;
      } finally {
        void qc.invalidateQueries({ queryKey: notificationKeys.all });
      }
    }
    const now = () => new Date().toISOString();
    return {
      markAsRead: (notificationId: string) =>
        change(
          (list) => ({
            notifications: list.notifications.map((n) =>
              n.id === notificationId ? { ...n, isRead: true, readAt: now() } : n,
            ),
            unreadCount: Math.max(0, list.unreadCount - 1),
          }),
          () => api.post('/notifications/mark-read', { notificationId }),
        ),
      markAllAsRead: () =>
        change(
          (list) => ({
            notifications: list.notifications.map((n) => ({ ...n, isRead: true, readAt: n.readAt ?? now() })),
            unreadCount: 0,
          }),
          () => api.post('/notifications/mark-all-read'),
        ),
    };
  }, [qc]);
}
