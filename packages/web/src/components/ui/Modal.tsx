import { useEffect, useRef, type ReactNode } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Renders the standard header and names the dialog. */
  title?: string;
  /** Names the dialog when it draws its own header instead of using `title`. */
  ariaLabel?: string;
  /**
   * Panel width. `full` drops the panel chrome entirely for content that
   * lays itself out over a darker backdrop (the image lightbox).
   */
  size?: 'sm' | 'md' | 'lg' | '2xl' | '4xl' | 'full';
  /** `top` pins the panel near the top, for a palette whose height changes. */
  align?: 'center' | 'top';
  /** Extra panel classes, e.g. a max height with a scrolling body. */
  className?: string;
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
};

// Stacked dialogs share one scroll lock, so closing the top one doesn't let
// the page scroll behind the dialog still open underneath.
let openCount = 0;

export function Modal({
  isOpen,
  onClose,
  children,
  title,
  ariaLabel,
  size = 'md',
  align = 'center',
  className = '',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, isOpen);
  useEscapeToClose(onClose, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    openCount += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      openCount -= 1;
      if (openCount === 0) document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const bare = size === 'full';
  const panelClass = bare
    ? 'relative w-full h-full'
    : `relative bg-white dark:bg-gray-800 rounded-xl shadow-xl mx-4 w-full ${sizes[size]} animate-in fade-in zoom-in-95 duration-200`;

  // Portaled to <body>: ancestors like the fixed sidebar create their own
  // stacking contexts, which would trap the overlay's z-index below the main
  // pane's sticky headers (the dialog rendered with its buttons covered).
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex justify-center ${
        align === 'top' ? 'items-start pt-[10vh]' : 'items-center'
      }`}
    >
      <div
        className={`fixed inset-0 transition-opacity ${bare ? 'bg-black/80' : 'bg-black/50'}`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? ariaLabel}
        tabIndex={-1}
        className={`${panelClass} focus:outline-hidden ${className}`}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
            <button
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
