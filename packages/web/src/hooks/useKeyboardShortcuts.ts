import { useEffect } from 'react';
import { useTaskActions } from '@/queries/taskActions';
import { useSelectionStore } from '@/stores/selectionStore';

interface ShortcutHandlers {
  quickAdd: () => void;
  search: () => void;
  commandPalette: () => void;
  shortcutsSheet: () => void;
}

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return Boolean(
    el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable),
  );
};

/** Task rows on screen, in order (the content element of each TaskItem). */
const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-task-row]'));

/** The row that has keyboard focus, if any. */
const focusedRow = () => (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-task-row]') ?? null;

/**
 * App-wide keyboard shortcuts. Single keys only act when you're not typing,
 * and not while a dialog is open (it has its own keys); ⌘K / Ctrl+K works
 * anywhere. Task commands apply to the row with keyboard focus.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const { completeTask, uncompleteTask, deleteTask, updateTask } = useTaskActions();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handlers.commandPalette();
        return;
      }
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      const row = focusedRow();
      const taskId = row?.dataset.taskId;
      const handled = () => e.preventDefault();

      switch (e.key) {
        case 'q':
          handled();
          handlers.quickAdd();
          return;
        case '/':
          handled();
          handlers.search();
          return;
        case '?':
          handled();
          handlers.shortcutsSheet();
          return;
        case 'j':
        case 'k': {
          const list = rows();
          if (list.length === 0) return;
          handled();
          const index = row ? list.indexOf(row) : -1;
          const next =
            index === -1 ? (e.key === 'j' ? 0 : list.length - 1) : Math.min(Math.max(index + (e.key === 'j' ? 1 : -1), 0), list.length - 1);
          list[next].focus();
          list[next].scrollIntoView({ block: 'nearest' });
          return;
        }
      }

      if (!row || !taskId) return;
      // A task you can only view can still be selected, nothing else.
      if (row.dataset.readonly === 'true' && e.key !== 'x') return;
      switch (e.key) {
        case 'e':
          handled();
          row.dispatchEvent(new CustomEvent('taskflow:edit'));
          return;
        case 't':
          handled();
          row.dispatchEvent(new CustomEvent('taskflow:date'));
          return;
        case 'c':
          handled();
          void (row.dataset.completed === 'true' ? uncompleteTask(taskId) : completeTask(taskId));
          return;
        case 'd':
        case 'Delete':
        case 'Backspace': {
          handled();
          // Keep the keyboard in the list: focus the neighbour before it goes.
          const list = rows();
          const index = list.indexOf(row);
          (list[index + 1] ?? list[index - 1])?.focus();
          void deleteTask(taskId);
          return;
        }
        case 'x':
          handled();
          useSelectionStore.getState().toggle(taskId);
          return;
        case '1':
        case '2':
        case '3':
        case '4':
          handled();
          void updateTask(taskId, { priority: Number(e.key) });
          return;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handlers, completeTask, uncompleteTask, deleteTask, updateTask]);
}
