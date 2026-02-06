import { useEffect, useState, useCallback } from 'react';

interface UseKeyboardNavOptions {
  taskIds: string[];
  onOpenDetail: (taskId: string) => void;
  onCloseDetail: () => void;
  onSetDueToday?: (taskId: string) => void;
  enabled?: boolean;
}

export function useKeyboardNav({
  taskIds,
  onOpenDetail,
  onCloseDetail,
  onSetDueToday,
  enabled = true,
}: UseKeyboardNavOptions) {
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const focusedTaskId = focusedIndex >= 0 && focusedIndex < taskIds.length
    ? taskIds[focusedIndex]
    : null;

  const clearFocus = useCallback(() => setFocusedIndex(-1), []);

  useEffect(() => {
    if (!enabled) return;

    const isInputActive = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable;
    };

    const handler = (e: KeyboardEvent) => {
      if (isInputActive()) return;

      switch (e.key) {
        case 'j': {
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev + 1;
            return next >= taskIds.length ? prev : next;
          });
          break;
        }
        case 'k': {
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev - 1;
            return next < 0 ? 0 : next;
          });
          break;
        }
        case 'Enter': {
          if (focusedIndex >= 0 && focusedIndex < taskIds.length) {
            e.preventDefault();
            onOpenDetail(taskIds[focusedIndex]);
          }
          break;
        }
        case 't': {
          if (focusedIndex >= 0 && focusedIndex < taskIds.length && onSetDueToday) {
            e.preventDefault();
            onSetDueToday(taskIds[focusedIndex]);
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          onCloseDetail();
          setFocusedIndex(-1);
          break;
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled, taskIds, focusedIndex, onOpenDetail, onCloseDetail, onSetDueToday]);

  // Reset focus when task list changes
  useEffect(() => {
    setFocusedIndex(-1);
  }, [taskIds.length]);

  return { focusedIndex, focusedTaskId, clearFocus };
}
