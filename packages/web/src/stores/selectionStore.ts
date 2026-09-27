import { create } from 'zustand';

/**
 * Tasks selected for a bulk action. Client state: which rows the user has
 * picked on the current page, cleared after an action or on navigation.
 */
interface SelectionState {
  ids: string[];
  toggle: (id: string) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>()((set) => ({
  ids: [],
  toggle: (id) =>
    set((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id] })),
  clear: () => set((s) => (s.ids.length ? { ids: [] } : s)),
}));
