import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { anchoredStyle, useAnchoredPosition } from './useAnchoredPosition';

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** The element the popover opens beside (usually its trigger button). */
  anchorRef: RefObject<HTMLElement | null>;
  /** Accessible name of the popover. */
  label: string;
  children: ReactNode;
  side?: 'bottom' | 'top';
  align?: 'left' | 'right';
  className?: string;
}

/**
 * A floating panel beside a trigger (date picker, priority picker): rendered
 * into <body> so nothing covers or clips it, closed by a click outside or
 * Escape (which it keeps from also closing a panel or dialog underneath).
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  label,
  children,
  side = 'bottom',
  align = 'left',
  className = '',
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const position = useAnchoredPosition(open, anchorRef, ref, { side, align });

  // Move focus inside once it's on screen, so the keyboard can use it.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      ref.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
      anchorRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    // Capture phase: runs before a surrounding panel's or dialog's own
    // Escape listener, so Escape closes only the popover.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      style={anchoredStyle(position)}
      // Clicks inside don't reach the row behind (React events bubble
      // through portals to their React parent).
      onClick={(e) => e.stopPropagation()}
      className={`z-[60] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
