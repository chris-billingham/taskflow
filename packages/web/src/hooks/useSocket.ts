import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { getAccessToken } from '@/services/api';
import { initSocket, disconnectSocket } from '@/services/socket';

export function useSocket(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    if (isLoading || !isAuthenticated) {
      disconnectSocket();
      return;
    }

    const token = getAccessToken();
    if (!token) return;

    initSocket(token);
  }, [isAuthenticated, isLoading]);
}
