import { useState, useRef, useEffect } from 'react';
import {
  MoreHorizontal,
  ShieldCheck,
  User as UserIcon,
  KeyRound,
  UserMinus,
  UserCheck,
  Trash2,
  ArrowUpDown,
} from 'lucide-react';
import type { AdminUser } from '@/services/admin';

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export interface AdminUserRowProps {
  user: AdminUser;
  isCurrentUser: boolean;
  busy: boolean;
  onToggleRole: (user: AdminUser) => void;
  onToggleActive: (user: AdminUser) => void;
  onResetPassword: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
}

export function AdminUserRow({
  user,
  isCurrentUser,
  busy,
  onToggleRole,
  onToggleActive,
  onResetPassword,
  onDelete,
}: AdminUserRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const isAdmin = user.role === 'ADMIN';
  // Suspending or deleting yourself is refused by the server too; hiding the
  // options keeps the UI from offering an action that can only ever fail.
  const canSuspend = !isCurrentUser;
  const canDelete = !isCurrentUser;

  const run = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    <div
      data-testid="admin-user-row"
      className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
        user.isActive ? '' : 'opacity-60'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#db4c3f] text-sm font-medium text-white">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
          ) : (
            user.name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
            {user.name}
            {isCurrentUser && (
              <span className="ml-1 text-xs font-normal text-gray-400">(you)</span>
            )}
          </p>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
            {user.email}
          </p>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        <span className="hidden text-xs text-gray-400 sm:inline">
          Last seen {formatDate(user.lastLoginAt)}
        </span>

        {!user.isActive && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 dark:bg-red-950/50">
            Suspended
          </span>
        )}

        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            isAdmin
              ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
          }`}
        >
          {isAdmin ? (
            <ShieldCheck className="h-3 w-3" />
          ) : (
            <UserIcon className="h-3 w-3" />
          )}
          {isAdmin ? 'Admin' : 'User'}
        </span>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            disabled={busy}
            aria-label={`Actions for ${user.name}`}
            className="rounded p-1 hover:bg-gray-200 disabled:opacity-40 dark:hover:bg-gray-600"
          >
            <MoreHorizontal className="h-4 w-4 text-gray-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800">
              <button
                onClick={run(() => onToggleRole(user))}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <ArrowUpDown className="h-4 w-4" />
                {isAdmin ? 'Revoke admin' : 'Make admin'}
              </button>

              <button
                onClick={run(() => onResetPassword(user))}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <KeyRound className="h-4 w-4" />
                Reset password
              </button>

              {canSuspend && (
                <button
                  onClick={run(() => onToggleActive(user))}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {user.isActive ? (
                    <UserMinus className="h-4 w-4" />
                  ) : (
                    <UserCheck className="h-4 w-4" />
                  )}
                  {user.isActive ? 'Suspend account' : 'Reactivate account'}
                </button>
              )}

              {canDelete && (
                <>
                  <hr className="my-1 border-gray-100 dark:border-gray-700" />
                  <button
                    onClick={run(() => onDelete(user))}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete permanently
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
