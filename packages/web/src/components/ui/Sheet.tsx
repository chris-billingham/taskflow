import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';

interface SheetProps {
  onClose: () => void;
  /** Accessible name of the panel. */
  label: string;
  children: ReactNode;
}

/**
 * A panel that slides in from the right over the page (the task panel). Focus
 * stays inside while it's open, Escape and a click outside close it, and it
 * renders into <body> so no ancestor's stacking context can cover it.
 */
export function Sheet({ onClose, label, children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true);
  // Shares the overlay stack with Modal: Escape in a dialog opened from the
  // panel (a lightbox, a confirm) closes that dialog, not the panel too.
  useEscapeToClose(onClose);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="fixed top-0 right-0 h-full w-full max-w-lg bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col border-l border-gray-200 dark:border-gray-700 animate-in slide-in-from-right duration-200 focus:outline-hidden"
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
