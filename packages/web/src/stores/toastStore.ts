import { create } from 'zustand';

// Minimal toast system. Until now the app had NO failure feedback: a rejected
// mutation silently rolled back (or nothing visibly happened at all) and the
// user walked away believing their change was saved.

export interface Toast {
  id: number;
  message: string;
  variant: 'error' | 'success' | 'info';
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, variant?: Toast['variant']) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  push: (message, variant = 'error') => {
    const id = nextId++;
    set((state) => {
      // Collapse duplicates (a burst of failing requests shows one toast).
      if (state.toasts.some((t) => t.message === message)) return state;
      return { toasts: [...state.toasts, { id, message, variant }] };
    });
    setTimeout(() => {
      useToastStore.getState().dismiss(id);
    }, 6000);
  },

  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative helper for non-React call sites (stores, services). */
export function toastError(message: string): void {
  useToastStore.getState().push(message, 'error');
}
