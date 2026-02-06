import { create } from 'zustand';
import api from '@/services/api';

export interface Label {
  id: string;
  name: string;
  color: string;
  userId: string;
  isFavorite: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface LabelState {
  labels: Map<string, Label>;
  loading: boolean;
  error: string | null;

  // Actions
  fetchLabels: () => Promise<void>;
  createLabel: (data: { name: string; color?: string }) => Promise<Label>;
  updateLabel: (
    id: string,
    data: Partial<{ name: string; color: string; isFavorite: boolean; sortOrder: number }>,
  ) => Promise<Label>;
  deleteLabel: (id: string) => Promise<void>;
  reorderLabels: (labelIds: string[]) => Promise<void>;
}

export const useLabelStore = create<LabelState>()((set, get) => ({
  labels: new Map(),
  loading: false,
  error: null,

  fetchLabels: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get('/labels');
      const labels = new Map<string, Label>();
      for (const l of data.data) {
        labels.set(l.id, l);
      }
      set({ labels, loading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.message || 'Failed to fetch labels',
        loading: false,
      });
    }
  },

  createLabel: async (input) => {
    const { data } = await api.post('/labels', input);
    const label = data.data as Label;
    set((state) => {
      const labels = new Map(state.labels);
      labels.set(label.id, label);
      return { labels };
    });
    return label;
  },

  updateLabel: async (id, input) => {
    const prev = get().labels.get(id);
    if (prev) {
      set((state) => {
        const labels = new Map(state.labels);
        labels.set(id, { ...prev, ...input } as Label);
        return { labels };
      });
    }

    try {
      const { data } = await api.patch(`/labels/${id}`, input);
      const label = data.data as Label;
      set((state) => {
        const labels = new Map(state.labels);
        labels.set(id, label);
        return { labels };
      });
      return label;
    } catch (err) {
      if (prev) {
        set((state) => {
          const labels = new Map(state.labels);
          labels.set(id, prev);
          return { labels };
        });
      }
      throw err;
    }
  },

  deleteLabel: async (id) => {
    const prev = get().labels.get(id);
    set((state) => {
      const labels = new Map(state.labels);
      labels.delete(id);
      return { labels };
    });

    try {
      await api.delete(`/labels/${id}`);
    } catch (err) {
      if (prev) {
        set((state) => {
          const labels = new Map(state.labels);
          labels.set(id, prev);
          return { labels };
        });
      }
      throw err;
    }
  },

  reorderLabels: async (labelIds) => {
    const prevLabels = new Map(get().labels);
    set((state) => {
      const labels = new Map(state.labels);
      labelIds.forEach((id, index) => {
        const l = labels.get(id);
        if (l) {
          labels.set(id, { ...l, sortOrder: index });
        }
      });
      return { labels };
    });

    try {
      await api.put('/labels/reorder', { labelIds });
    } catch (err) {
      set({ labels: prevLabels });
      throw err;
    }
  },
}));

// Selectors
export const selectLabelsArray = (state: LabelState) =>
  Array.from(state.labels.values()).sort((a, b) => a.sortOrder - b.sortOrder);

export const selectFavoriteLabels = (state: LabelState) =>
  Array.from(state.labels.values())
    .filter((l) => l.isFavorite)
    .sort((a, b) => a.sortOrder - b.sortOrder);
