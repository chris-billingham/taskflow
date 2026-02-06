import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ViewConfig {
  showCompleted: boolean;
  grouping: 'date' | 'priority' | 'project';
  sort: 'dueDate' | 'priority' | 'alphabetical' | 'created';
}

interface UIState {
  sidebarOpen: boolean;
  taskDetailId: string | null;
  viewConfig: ViewConfig;
  quickAddOpen: boolean;

  toggleSidebar: () => void;
  openTaskDetail: (id: string) => void;
  closeTaskDetail: () => void;
  setViewConfig: (config: Partial<ViewConfig>) => void;
  setQuickAddOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      taskDetailId: null,
      viewConfig: {
        showCompleted: false,
        grouping: 'date',
        sort: 'dueDate',
      },
      quickAddOpen: false,

      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      openTaskDetail: (id) => set({ taskDetailId: id }),
      closeTaskDetail: () => set({ taskDetailId: null }),
      setViewConfig: (config) =>
        set((s) => ({ viewConfig: { ...s.viewConfig, ...config } })),
      setQuickAddOpen: (open) => set({ quickAddOpen: open }),
    }),
    {
      name: 'taskflow-ui',
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        viewConfig: state.viewConfig,
      }),
    },
  ),
);
