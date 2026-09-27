import { useLayoutEffect, useState, type RefObject } from 'react';

export interface AnchoredPosition {
  top: number;
  left: number;
  width?: number;
}

/**
 * Fixed-position coordinates for a floating element (menu, popover) beside
 * its trigger. Floating elements render into <body>: inside a row they were
 * trapped in its stacking context and drawn under the content after it. The
 * element flips to the other side when there isn't room, stays on screen
 * horizontally, and follows the trigger on scroll and resize.
 */
export function useAnchoredPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  floatingRef: RefObject<HTMLElement | null>,
  { side = 'bottom', align = 'left', matchWidth = false }: {
    side?: 'bottom' | 'top';
    align?: 'left' | 'right';
    matchWidth?: boolean;
  } = {},
): AnchoredPosition | null {
  const [position, setPosition] = useState<AnchoredPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const place = () => {
      const anchor = anchorRef.current;
      const floating = floatingRef.current;
      if (!anchor || !floating) return;
      const a = anchor.getBoundingClientRect();
      const height = floating.offsetHeight;
      const width = matchWidth ? a.width : floating.offsetWidth;
      const gap = 4;
      const fitsBelow = a.bottom + gap + height <= window.innerHeight - 8;
      const fitsAbove = a.top - gap - height >= 8;
      const openUp = side === 'top' ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove;
      const top = openUp ? a.top - gap - height : a.bottom + gap;
      const rawLeft = align === 'right' ? a.right - width : a.left;
      const left = Math.min(Math.max(8, rawLeft), window.innerWidth - width - 8);
      setPosition({ top, left, width: matchWidth ? a.width : undefined });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchorRef, floatingRef, side, align, matchWidth]);

  return position;
}

/** Style for a floating element: fixed, and off screen until placed. */
export function anchoredStyle(position: AnchoredPosition | null) {
  return {
    position: 'fixed' as const,
    top: position?.top ?? -9999,
    left: position?.left ?? -9999,
    width: position?.width,
  };
}
