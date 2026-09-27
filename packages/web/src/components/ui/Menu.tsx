import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';

const MenuContext = createContext<{ close: () => void } | null>(null);

interface MenuProps {
  /** Accessible name of the trigger button, e.g. "Project options". */
  label: string;
  /** The trigger's content, usually an icon. */
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  triggerClassName?: string;
  menuClassName?: string;
}

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
  triggerClassName = '',
  menuClassName = '',
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    // Focus the first item once the menu is on screen.
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);

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
        className={`inline-flex items-center justify-center rounded p-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${triggerClassName}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger}
      </button>
      {open && (
        <MenuContext.Provider value={{ close }}>
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            className={`absolute top-full mt-1 z-50 min-w-[10rem] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 ${
              align === 'right' ? 'right-0' : 'left-0'
            } ${menuClassName}`}
          >
            {children}
          </div>
        </MenuContext.Provider>
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
}

export function MenuItem({ onSelect, children, icon: Icon, tone = 'default', disabled }: MenuItemProps) {
  const ctx = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left focus:outline-none disabled:opacity-50 ${
        tone === 'danger'
          ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:bg-red-50 dark:focus:bg-red-900/20'
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
