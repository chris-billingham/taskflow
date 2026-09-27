import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Which workspace the switcher has selected: UI state, kept across reloads.
 * The workspaces themselves, their members and invites are server data in
 * queries/workspaces.ts.
 */
interface WorkspaceSelection {
  currentWorkspaceId: string | null;
  switchWorkspace: (id: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceSelection>()(
  persist(
    (set) => ({
      currentWorkspaceId: null,
      switchWorkspace: (id) => set({ currentWorkspaceId: id }),
    }),
    {
      name: 'workspace-storage',
      partialize: (state) => ({ currentWorkspaceId: state.currentWorkspaceId }),
    },
  ),
);
