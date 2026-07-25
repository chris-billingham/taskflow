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

    // AppLayout (this hook's host) unmounts on logout before the effect can
    // re-run with isAuthenticated=false, so without this cleanup the previous
    // user's authenticated socket would survive into the next session.
    return () => disconnectSocket();
  }, [isAuthenticated, isLoading]);
}
