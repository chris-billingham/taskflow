import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';

const MenuContext = createContext<{ close: () => void } | null>(null);

interface MenuProps {
  /** Accessible name of the trigger button, e.g. "Options for Groceries". Name the item
   * when a list has one per row, so each trigger is distinguishable. */
  label: string;
  /** The trigger's content, usually an icon. */
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  /** Which side of the trigger the list opens on; 'top' suits triggers at the bottom of the screen. */
  side?: 'bottom' | 'top';
  /**
   * 'icon' styles the trigger as a small icon button; 'plain' leaves styling
   * to triggerClassName, for triggers that show text (an avatar and name).
   */
  triggerVariant?: 'icon' | 'plain';
  triggerClassName?: string;
  menuClassName?: string;
  /** Make the list as wide as the trigger (e.g. a full-width switcher). */
  fullWidth?: boolean;
  /** Control the open state, e.g. to also open the menu from a row's right-click. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"]';

/**
 * A dropdown menu: a labelled trigger and a list of actions. Arrow keys,
 * Home/End and Escape work, focus returns to the trigger on close, and a
 * click anywhere else closes it. Clicks don't reach the row behind it.
 */
export function Menu({
  label,
  trigger,
  children,
  align = 'right',
  side = 'bottom',
  triggerVariant = 'icon',
  triggerClassName = '',
  menuClassName = '',
  fullWidth = false,
  open: openProp,
  onOpenChange,
}: MenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  // Read through a ref so `close` stays stable for the items' context.
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const setOpen = useCallback((next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChangeRef.current?.(next);
  }, []);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [position, setPosition] = useState<{ top: number; left: number; width?: number } | null>(null);

  // The list renders into <body> at fixed coordinates beside the trigger:
  // inside a row it was trapped in that row's stacking context (sortable rows
  // are transformed) and drawn underneath whatever came after it. It flips to
  // the other side when there isn't room, and follows the trigger on scroll.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const place = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const t = trigger.getBoundingClientRect();
      const menuHeight = menu.offsetHeight;
      const menuWidth = fullWidth ? t.width : menu.offsetWidth;
      const gap = 4;
      const fitsBelow = t.bottom + gap + menuHeight <= window.innerHeight - 8;
      const fitsAbove = t.top - gap - menuHeight >= 8;
      const openUp = side === 'top' ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove;
      const top = openUp ? t.top - gap - menuHeight : t.bottom + gap;
      const rawLeft = align === 'right' ? t.right - menuWidth : t.left;
      const left = Math.min(Math.max(8, rawLeft), window.innerWidth - menuWidth - 8);
      setPosition({ top, left, width: fullWidth ? t.width : undefined });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, side, align, fullWidth]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    // Focus the current choice (in a pick-one menu) or else the first item
    // once the menu is on screen.
    const menu = menuRef.current;
    (
      menu?.querySelector<HTMLElement>('[aria-checked="true"]') ?? menu?.querySelector<HTMLElement>(ITEM_SELECTOR)
    )?.focus({ preventScroll: true });
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, setOpen]);

  const items = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled])',
      ) ?? [],
    );

  const onMenuKeyDown = (e: KeyboardEvent) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => list[(i + list.length) % list.length]?.focus();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusAt(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAt(0);
        break;
      case 'End':
        e.preventDefault();
        focusAt(list.length - 1);
        break;
      case 'Escape':
      case 'Tab':
        e.preventDefault();
        close();
        break;
    }
  };

  return (
    <div className="relative" ref={rootRef} onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={`focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
          triggerVariant === 'icon'
            ? 'inline-flex items-center justify-center rounded p-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'
            : ''
        } ${triggerClassName}`}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <MenuContext.Provider value={{ close }}>
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={label}
              onKeyDown={onMenuKeyDown}
              // Above dialogs and the task panel (z-50). Off screen until placed:
              // not visibility:hidden, which would stop the first item taking focus.
              style={{
                position: 'fixed',
                top: position?.top ?? -9999,
                left: position?.left ?? -9999,
                width: position?.width,
              }}
              className={`z-[60] min-w-[10rem] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 ${menuClassName}`}
            >
              {children}
            </div>
          </MenuContext.Provider>,
          document.body,
        )}
    </div>
  );
}

interface MenuItemProps {
  onSelect: () => void;
  children: ReactNode;
  icon?: LucideIcon;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /**
   * Makes the item one choice of a pick-one set (role="menuitemradio"), with
   * `true` marking the current choice.
   */
  checked?: boolean;
}

export function MenuItem({ onSelect, children, icon: Icon, tone = 'default', disabled, checked }: MenuItemProps) {
  const ctx = useContext(MenuContext);
  const isRadio = checked !== undefined;
  return (
    <button
      type="button"
      role={isRadio ? 'menuitemradio' : 'menuitem'}
      aria-checked={isRadio ? checked : undefined}
      tabIndex={-1}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left focus:outline-none disabled:opacity-50 ${
        tone === 'danger'
          ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:bg-red-50 dark:focus:bg-red-900/20'
          : checked
            ? 'bg-gray-50 dark:bg-gray-700 text-primary-500 font-medium focus:bg-gray-100 dark:focus:bg-gray-600'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:bg-gray-50 dark:focus:bg-gray-700'
      }`}
      onClick={() => {
        ctx?.close();
        onSelect();
      }}
    >
      {Icon && <Icon className="w-4 h-4" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <hr role="separator" className="my-1 border-gray-100 dark:border-gray-700" />;
}
