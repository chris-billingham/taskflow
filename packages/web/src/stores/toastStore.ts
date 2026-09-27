import { create } from 'zustand';

// Minimal toast system. Until now the app had NO failure feedback: a rejected
// mutation silently rolled back (or nothing visibly happened at all) and the
// user walked away believing their change was saved.

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  message: string;
  variant: 'error' | 'success' | 'info';
  /** A button in the toast, e.g. Undo. Running it dismisses the toast. */
  action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, variant?: Toast['variant'], action?: ToastAction) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  push: (message, variant = 'error', action) => {
    const id = nextId++;
    set((state) => {
      // Collapse duplicate messages (a burst of failing requests shows one
      // toast), but never an action toast: each Undo undoes something different.
      if (!action && state.toasts.some((t) => t.message === message && !t.action)) return state;
      // Keep the stack short when many things happen in a row.
      const kept = state.toasts.slice(-3);
      return { toasts: [...kept, { id, message, variant, action }] };
    });
    setTimeout(() => {
      useToastStore.getState().dismiss(id);
    }, 6000);
  },

  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** A confirmation with an Undo button (after completing, deleting, moving). */
export function toastUndo(message: string, undo: () => void): void {
  useToastStore.getState().push(message, 'info', { label: 'Undo', run: undo });
}

/** Imperative helper for non-React call sites (stores, services). */
export function toastError(message: string): void {
  useToastStore.getState().push(message, 'error');
}
