import { useEffect } from 'react';
import {
  subscribeToProject,
  unsubscribeFromProject,
  emitPresenceUpdate,
} from '@/services/socket';
import { useSocketStore } from '@/stores/socketStore';

/**
 * Keep this client subscribed to a project's realtime room while the view is
 * mounted. The subscription is registered with the socket service, which
 * re-joins it after every reconnect, so callers don't need to care about
 * connection state.
 */
export function useProjectRoom(
  projectId: string | undefined,
  workspaceId?: string | null,
): void {
  const status = useSocketStore((s) => s.status);

  useEffect(() => {
    if (!projectId) return;
    subscribeToProject(projectId, workspaceId ?? undefined);
    return () => unsubscribeFromProject(projectId);
  }, [projectId, workspaceId]);

  // Presence is ephemeral server-side (60s stale window), so announce it on
  // every (re)connect rather than only on mount.
  useEffect(() => {
    if (!projectId || !workspaceId || status !== 'connected') return;
    emitPresenceUpdate({ workspaceId, projectId });
  }, [projectId, workspaceId, status]);
}
