import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/services/api';

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
}

export interface WorkspaceInvite {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  token: string;
  expiresAt: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  ownerId: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
  _count?: { members: number; projects: number };
}

interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  members: WorkspaceMember[];
  invites: WorkspaceInvite[];
  loading: boolean;
  error: string | null;

  // Computed
  currentWorkspace: () => Workspace | null;

  // Actions
  fetchWorkspaces: () => Promise<void>;
  createWorkspace: (data: { name: string; description?: string }) => Promise<Workspace>;
  updateWorkspace: (id: string, data: { name?: string; description?: string | null }) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  switchWorkspace: (id: string | null) => void;
  fetchMembers: (workspaceId: string) => Promise<void>;
  inviteMember: (workspaceId: string, email: string, role: string) => Promise<WorkspaceInvite>;
  fetchInvites: (workspaceId: string) => Promise<void>;
  cancelInvite: (workspaceId: string, inviteId: string) => Promise<void>;
  resendInvite: (workspaceId: string, inviteId: string) => Promise<WorkspaceInvite>;
  acceptInvite: (token: string) => Promise<void>;
  updateMemberRole: (workspaceId: string, userId: string, role: string) => Promise<void>;
  removeMember: (workspaceId: string, userId: string) => Promise<void>;
  leaveWorkspace: (workspaceId: string) => Promise<void>;
  transferOwnership: (workspaceId: string, newOwnerId: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      currentWorkspaceId: null,
      members: [],
      invites: [],
      loading: false,
      error: null,

      currentWorkspace: () => {
        const { workspaces, currentWorkspaceId } = get();
        if (!currentWorkspaceId) return null;
        return workspaces.find((w) => w.id === currentWorkspaceId) ?? null;
      },

      fetchWorkspaces: async () => {
        set({ loading: true, error: null });
        try {
          const { data } = await api.get('/workspaces');
          set({ workspaces: data.data, loading: false });
        } catch (err: any) {
          set({
            error: err.response?.data?.message || 'Failed to fetch workspaces',
            loading: false,
          });
        }
      },

      createWorkspace: async (input) => {
        const { data } = await api.post('/workspaces', input);
        const workspace = data.data as Workspace;
        set((state) => ({
          workspaces: [...state.workspaces, workspace],
        }));
        return workspace;
      },

      updateWorkspace: async (id, input) => {
        const { data } = await api.patch(`/workspaces/${id}`, input);
        set((state) => ({
          workspaces: state.workspaces.map((w) =>
            w.id === id ? { ...w, ...data.data } : w,
          ),
        }));
      },

      deleteWorkspace: async (id) => {
        await api.delete(`/workspaces/${id}`);
        set((state) => ({
          workspaces: state.workspaces.filter((w) => w.id !== id),
          currentWorkspaceId:
            state.currentWorkspaceId === id ? null : state.currentWorkspaceId,
        }));
      },

      switchWorkspace: (id) => {
        set({ currentWorkspaceId: id, members: [], invites: [] });
      },

      fetchMembers: async (workspaceId) => {
        try {
          const { data } = await api.get(`/workspaces/${workspaceId}/members`);
          set({ members: data.data });
        } catch (err: any) {
          set({
            error: err.response?.data?.message || 'Failed to fetch members',
          });
        }
      },

      inviteMember: async (workspaceId, email, role) => {
        const { data } = await api.post(`/workspaces/${workspaceId}/invite`, {
          email,
          role,
        });
        const invite = data.data as WorkspaceInvite;
        set((state) => ({
          invites: [...state.invites, invite],
        }));
        return invite;
      },

      fetchInvites: async (workspaceId) => {
        try {
          const { data } = await api.get(`/workspaces/${workspaceId}/invites`);
          set({ invites: data.data });
        } catch {
          // Invites may not be visible to non-admins
        }
      },

      cancelInvite: async (workspaceId, inviteId) => {
        await api.delete(`/workspaces/${workspaceId}/invites/${inviteId}`);
        set((state) => ({
          invites: state.invites.filter((i) => i.id !== inviteId),
        }));
      },

      resendInvite: async (workspaceId, inviteId) => {
        const { data } = await api.post(
          `/workspaces/${workspaceId}/invites/${inviteId}/resend`,
        );
        const updated = data.data as WorkspaceInvite;
        set((state) => ({
          invites: state.invites.map((i) =>
            i.id === inviteId ? updated : i,
          ),
        }));
        return updated;
      },

      acceptInvite: async (token) => {
        const { data } = await api.post('/workspaces/join', { token });
        const workspace = data.data.workspace as Workspace;
        set((state) => ({
          workspaces: [...state.workspaces, workspace],
        }));
      },

      updateMemberRole: async (workspaceId, userId, role) => {
        const { data } = await api.patch(
          `/workspaces/${workspaceId}/members/${userId}`,
          { role },
        );
        set((state) => ({
          members: state.members.map((m) =>
            m.userId === userId ? { ...m, ...data.data } : m,
          ),
        }));
      },

      removeMember: async (workspaceId, userId) => {
        await api.delete(`/workspaces/${workspaceId}/members/${userId}`);
        set((state) => ({
          members: state.members.filter((m) => m.userId !== userId),
        }));
      },

      leaveWorkspace: async (workspaceId) => {
        await api.post(`/workspaces/${workspaceId}/leave`);
        set((state) => ({
          workspaces: state.workspaces.filter((w) => w.id !== workspaceId),
          currentWorkspaceId:
            state.currentWorkspaceId === workspaceId
              ? null
              : state.currentWorkspaceId,
        }));
      },

      transferOwnership: async (workspaceId, newOwnerId) => {
        await api.post(`/workspaces/${workspaceId}/transfer`, { newOwnerId });
        // Refetch to get updated roles
        await get().fetchWorkspaces();
        await get().fetchMembers(workspaceId);
      },
    }),
    {
      name: 'workspace-storage',
      partialize: (state) => ({
        currentWorkspaceId: state.currentWorkspaceId,
      }),
    },
  ),
);

export const selectCurrentWorkspace = (state: WorkspaceState) => {
  if (!state.currentWorkspaceId) return null;
  return state.workspaces.find((w) => w.id === state.currentWorkspaceId) ?? null;
};
