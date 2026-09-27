import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type {
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceSummary,
} from '@taskflow/contract';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { reportMutationError } from '@/utils/reportError';
import { projectKeys } from './projects';
import { taskKeys } from './taskKeys';

export type { WorkspaceInvite, WorkspaceMember, WorkspaceRole };

/** A workspace you belong to, with your role (counts where the endpoint includes them). */
export type Workspace = Omit<WorkspaceSummary, '_count'> & { _count?: WorkspaceSummary['_count'] };

export const workspaceKeys = {
  all: ['workspaces'] as const,
  list: () => ['workspaces', 'list'] as const,
  members: (id: string) => ['workspaces', 'members', id] as const,
  invites: (id: string) => ['workspaces', 'invites', id] as const,
};

export function useWorkspaces() {
  const query = useQuery({
    queryKey: workspaceKeys.list(),
    queryFn: async () => (await api.get('/workspaces')).data.data as Workspace[],
  });
  return { workspaces: query.data ?? [], loading: query.isLoading };
}

/** The workspace picked in the switcher, if you still belong to it. */
export function useCurrentWorkspace(): Workspace | null {
  const { workspaces } = useWorkspaces();
  const currentId = useWorkspaceStore((s) => s.currentWorkspaceId);
  return workspaces.find((w) => w.id === currentId) ?? null;
}

export function useWorkspaceMembers(workspaceId: string | undefined) {
  const query = useQuery({
    queryKey: workspaceKeys.members(workspaceId ?? ''),
    queryFn: async () => (await api.get(`/workspaces/${workspaceId}/members`)).data.data as WorkspaceMember[],
    enabled: Boolean(workspaceId),
  });
  return query.data ?? [];
}

/** Pending invites; only admins can see them. */
export function useWorkspaceInvites(workspaceId: string | undefined, isAdmin: boolean) {
  const query = useQuery({
    queryKey: workspaceKeys.invites(workspaceId ?? ''),
    queryFn: async () => (await api.get(`/workspaces/${workspaceId}/invites`)).data.data as WorkspaceInvite[],
    enabled: Boolean(workspaceId) && isAdmin,
  });
  return query.data ?? [];
}

export function useWorkspaceActions() {
  const qc = useQueryClient();
  return useMemo(() => {
    // failure: a toast, or null where the caller shows its own error.
    async function run<R>(request: () => Promise<R>, failure: string | null, alsoProjects = false): Promise<R> {
      try {
        return await request();
      } catch (err) {
        if (failure) reportMutationError(err, failure);
        throw err;
      } finally {
        void qc.invalidateQueries({ queryKey: workspaceKeys.all });
        if (alsoProjects) {
          // Joining or leaving a workspace changes which projects and tasks you see.
          void qc.invalidateQueries({ queryKey: projectKeys.all });
          void qc.invalidateQueries({ queryKey: taskKeys.all });
        }
      }
    }
    const forgetIfCurrent = (id: string) => {
      const store = useWorkspaceStore.getState();
      if (store.currentWorkspaceId === id) store.switchWorkspace(null);
    };

    return {
      createWorkspace: (input: { name: string; description?: string }) =>
        run(async () => (await api.post('/workspaces', input)).data.data as Workspace, null),
      updateWorkspace: (id: string, input: { name?: string; description?: string | null }) =>
        run(() => api.patch(`/workspaces/${id}`, input).then(() => undefined), null),
      deleteWorkspace: async (id: string) => {
        await run(() => api.delete(`/workspaces/${id}`), 'The workspace could not be deleted', true);
        forgetIfCurrent(id);
      },
      /** Throws without a toast: the invite dialog shows its own error. */
      inviteMember: (workspaceId: string, email: string, role: string) =>
        run(
          async () => (await api.post(`/workspaces/${workspaceId}/invite`, { email, role })).data.data as WorkspaceInvite,
          null,
        ),
      cancelInvite: (workspaceId: string, inviteId: string) =>
        run(() => api.delete(`/workspaces/${workspaceId}/invites/${inviteId}`), 'The invite could not be cancelled'),
      resendInvite: (workspaceId: string, inviteId: string) =>
        run(
          async () =>
            (await api.post(`/workspaces/${workspaceId}/invites/${inviteId}/resend`)).data.data as WorkspaceInvite,
          'The invite could not be resent',
        ),
      /** Throws without a toast: the join page shows its own error. */
      acceptInvite: (token: string) =>
        run(() => api.post('/workspaces/join', { token }).then(() => undefined), null, true),
      updateMemberRole: (workspaceId: string, userId: string, role: string) =>
        run(
          () => api.patch(`/workspaces/${workspaceId}/members/${userId}`, { role }).then(() => undefined),
          'The role could not be changed',
        ),
      removeMember: (workspaceId: string, userId: string) =>
        run(() => api.delete(`/workspaces/${workspaceId}/members/${userId}`), 'The member could not be removed', true),
      leaveWorkspace: async (workspaceId: string) => {
        await run(() => api.post(`/workspaces/${workspaceId}/leave`), 'You could not leave the workspace', true);
        forgetIfCurrent(workspaceId);
      },
      transferOwnership: (workspaceId: string, newOwnerId: string) =>
        run(
          () => api.post(`/workspaces/${workspaceId}/transfer`, { newOwnerId }).then(() => undefined),
          'Ownership could not be transferred',
        ),
    };
  }, [qc]);
}
