import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keep keyboard focus inside a dialog while it is open, and give it back to
 * the previously-focused element on close. Without this, Tab walked straight
 * out of every modal into the obscured page behind it. A field inside that
 * asked for `autoFocus` keeps focus rather than losing it to the first button.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean = true,
): void {
  // autoFocus moves focus into the dialog during commit, before this effect
  // runs, so the opener is noted while rendering the open transition.
  const openerAtRender = useRef<HTMLElement | null>(null);
  const wasActive = useRef(false);
  if (active && !wasActive.current) {
    openerAtRender.current = document.activeElement as HTMLElement | null;
  }
  wasActive.current = active;

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const current = document.activeElement as HTMLElement | null;
    const focusIsInside = !!current && container.contains(current);
    // Prefer what is focused now: a menu that opened this dialog has already
    // handed focus back to its trigger, which outlives the menu item.
    const previouslyFocused = focusIsInside ? openerAtRender.current : current;
    if (!focusIsInside) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? container).focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [ref, active]);
}
