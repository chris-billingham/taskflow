import { create } from 'zustand';
import api from '@/services/api';
import type { Task } from '@/stores/taskStore';

export interface Filter {
  id: string;
  name: string;
  query: string;
  color: string;
  userId: string;
  isFavorite: boolean;
  sortOrder: number;
  viewStyle: 'LIST' | 'BOARD' | 'CALENDAR';
  createdAt: string;
  updatedAt: string;
}

interface FilterState {
  filters: Map<string, Filter>;
  loading: boolean;
  error: string | null;
  filterResults: Task[];
  filterLoading: boolean;

  // Actions
  fetchFilters: () => Promise<void>;
  createFilter: (data: {
    name: string;
    query: string;
    color?: string;
    viewStyle?: string;
  }) => Promise<Filter>;
  updateFilter: (
    id: string,
    data: Partial<{
      name: string;
      query: string;
      color: string;
      isFavorite: boolean;
      sortOrder: number;
      viewStyle: string;
    }>,
  ) => Promise<Filter>;
  deleteFilter: (id: string) => Promise<void>;
  executeFilter: (query: string) => Promise<Task[]>;
  validateFilter: (query: string) => Promise<{ valid: boolean; error?: string }>;
}

export const useFilterStore = create<FilterState>()((set, get) => ({
  filters: new Map(),
  loading: false,
  error: null,
  filterResults: [],
  filterLoading: false,

  fetchFilters: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get('/filters');
      const filters = new Map<string, Filter>();
      for (const f of data.data) {
        filters.set(f.id, f);
      }
      set({ filters, loading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.message || 'Failed to fetch filters',
        loading: false,
      });
    }
  },

  createFilter: async (input) => {
    const { data } = await api.post('/filters', input);
    const filter = data.data as Filter;
    set((state) => {
      const filters = new Map(state.filters);
      filters.set(filter.id, filter);
      return { filters };
    });
    return filter;
  },

  updateFilter: async (id, input) => {
    const prev = get().filters.get(id);
    if (prev) {
      set((state) => {
        const filters = new Map(state.filters);
        filters.set(id, { ...prev, ...input } as Filter);
        return { filters };
      });
    }

    try {
      const { data } = await api.patch(`/filters/${id}`, input);
      const filter = data.data as Filter;
      set((state) => {
        const filters = new Map(state.filters);
        filters.set(id, filter);
        return { filters };
      });
      return filter;
    } catch (err) {
      if (prev) {
        set((state) => {
          const filters = new Map(state.filters);
          filters.set(id, prev);
          return { filters };
        });
      }
      throw err;
    }
  },

  deleteFilter: async (id) => {
    const prev = get().filters.get(id);
    set((state) => {
      const filters = new Map(state.filters);
      filters.delete(id);
      return { filters };
    });

    try {
      await api.delete(`/filters/${id}`);
    } catch (err) {
      if (prev) {
        set((state) => {
          const filters = new Map(state.filters);
          filters.set(id, prev);
          return { filters };
        });
      }
      throw err;
    }
  },

  executeFilter: async (query) => {
    set({ filterLoading: true });
    try {
      const { data } = await api.post('/filters/query', { query });
      const tasks = data.data as Task[];
      set({ filterResults: tasks, filterLoading: false });
      return tasks;
    } catch (err: any) {
      set({ filterLoading: false });
      throw err;
    }
  },

  validateFilter: async (query) => {
    const { data } = await api.post('/filters/validate', { query });
    return data.data as { valid: boolean; error?: string };
  },
}));

// Selectors
export const selectFiltersArray = (state: FilterState) =>
  Array.from(state.filters.values()).sort((a, b) => a.sortOrder - b.sortOrder);

export const selectFavoriteFilters = (state: FilterState) =>
  Array.from(state.filters.values())
    .filter((f) => f.isFavorite)
    .sort((a, b) => a.sortOrder - b.sortOrder);
