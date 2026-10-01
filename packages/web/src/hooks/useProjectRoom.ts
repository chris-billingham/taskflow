import { useEffect } from 'react';
import { subscribeToProject, unsubscribeFromProject } from '@/services/socket';

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
  useEffect(() => {
    if (!projectId) return;
    subscribeToProject(projectId, workspaceId ?? undefined);
    return () => unsubscribeFromProject(projectId);
  }, [projectId, workspaceId]);
}
