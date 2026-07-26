import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { UserPlus, Search } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { Spinner } from '@/components/ui/Spinner';
import { AdminUserRow } from '@/components/admin/AdminUserRow';
import { CreateUserModal, type CreateUserValues } from '@/components/admin/CreateUserModal';
import { CredentialReveal } from '@/components/admin/CredentialReveal';
import * as adminApi from '@/services/admin';
import type { AdminUser, AdminStats } from '@/services/admin';

const PAGE_SIZE = 25;

export default function Admin() {
  const currentUser = useAuthStore((s) => s.user);
  const pushToast = useToastStore((s) => s.push);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);

  const load = useCallback(
    async (opts: { search: string; page: number }) => {
      setLoading(true);
      try {
        const [pageData, statsData] = await Promise.all([
          adminApi.fetchUsers({
            search: opts.search || undefined,
            page: opts.page,
            limit: PAGE_SIZE,
          }),
          adminApi.fetchStats(),
        ]);
        setUsers(pageData.users);
        setPages(pageData.pages);
        setTotal(pageData.total);
        setStats(statsData);
      } catch (err) {
        pushToast(adminApi.adminErrorMessage(err, 'Failed to load users'), 'error');
      } finally {
        setLoading(false);
      }
    },
    [pushToast],
  );

  const isAdmin = currentUser?.role === 'ADMIN';

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  // Skipped entirely for non-admins: the effect still runs on the render that
  // returns the redirect below, and firing an admin request there would earn a
  // guaranteed 403 and an error toast on the way out.
  useEffect(() => {
    if (!isAdmin) return;
    const timer = setTimeout(() => void load({ search, page }), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, page, load, isAdmin]);

  // Only admins reach the console. The server enforces this on every endpoint;
  // this redirect just avoids rendering a page that could only show errors.
  if (currentUser && !isAdmin) {
    return <Navigate to="/settings/profile" replace />;
  }

  const refresh = () => load({ search, page });

  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try {
      await fn();
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleRole = (user: AdminUser) =>
    withBusy(user.id, async () => {
      const next = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
      try {
        await adminApi.setUserRole(user.id, next);
        pushToast(
          next === 'ADMIN'
            ? `${user.name} is now an administrator`
            : `${user.name} is no longer an administrator`,
          'success',
        );
        await refresh();
      } catch (err) {
        pushToast(adminApi.adminErrorMessage(err, 'Failed to change role'), 'error');
      }
    });

  const handleToggleActive = (user: AdminUser) =>
    withBusy(user.id, async () => {
      try {
        await adminApi.setUserActive(user.id, !user.isActive);
        pushToast(
          user.isActive
            ? `${user.name} has been suspended and signed out`
            : `${user.name} can sign in again`,
          'success',
        );
        await refresh();
      } catch (err) {
        pushToast(adminApi.adminErrorMessage(err, 'Failed to update account'), 'error');
      }
    });

  const handleResetPassword = (user: AdminUser) =>
    withBusy(user.id, async () => {
      try {
        const result = await adminApi.resetUserPassword(user.id);
        if (result.temporaryPassword) {
          setCredential({ email: user.email, password: result.temporaryPassword });
        }
        pushToast(`Password reset for ${user.name}`, 'success');
      } catch (err) {
        pushToast(adminApi.adminErrorMessage(err, 'Failed to reset password'), 'error');
      }
    });

  const handleDelete = (user: AdminUser) =>
    withBusy(user.id, async () => {
      try {
        await adminApi.deleteUser(user.id);
        pushToast(`${user.name}'s account was deleted`, 'success');
        setPendingDelete(null);
        await refresh();
      } catch (err) {
        // The most common failure is the shared-workspace ownership guard,
        // whose message explains exactly what has to happen first.
        pushToast(adminApi.adminErrorMessage(err, 'Failed to delete user'), 'error');
        setPendingDelete(null);
      }
    });

  const handleCreate = async (values: CreateUserValues) => {
    try {
      const result = await adminApi.createUser(values);
      if (result.temporaryPassword) {
        setCredential({ email: result.user.email, password: result.temporaryPassword });
      }
      pushToast(`Created ${result.user.email}`, 'success');
      setCreateOpen(false);
      setPage(1);
      await load({ search, page: 1 });
    } catch (err) {
      // Rethrown so the modal shows it inline and keeps the typed values.
      throw new Error(adminApi.adminErrorMessage(err, 'Failed to create user'));
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Users</h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Manage every account on this Taskflow instance.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex flex-shrink-0 items-center gap-2 rounded-lg bg-[#db4c3f] px-4 py-2 text-sm font-medium text-white hover:bg-[#c53727]"
        >
          <UserPlus className="h-4 w-4" />
          Add user
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total', value: stats.total },
            { label: 'Active', value: stats.active },
            { label: 'Suspended', value: stats.suspended },
            { label: 'Admins', value: stats.admins },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
            >
              <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {credential && (
        <CredentialReveal
          email={credential.email}
          password={credential.password}
          onDismiss={() => setCredential(null)}
        />
      )}

      <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 p-3 dark:border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name or email"
              aria-label="Search users"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#db4c3f] dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : users.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            No users match “{search}”.
          </p>
        ) : (
          <div className="space-y-0.5 p-2">
            {users.map((user) => (
              <AdminUserRow
                key={user.id}
                user={user}
                isCurrentUser={user.id === currentUser?.id}
                busy={busyId === user.id}
                onToggleRole={handleToggleRole}
                onToggleActive={handleToggleActive}
                onResetPassword={handleResetPassword}
                onDelete={setPendingDelete}
              />
            ))}
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm dark:border-gray-700">
            <span className="text-gray-500 dark:text-gray-400">
              Page {page} of {pages} · {total} users
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-gray-200 px-3 py-1 text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="rounded-lg border border-gray-200 px-3 py-1 text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {pendingDelete && (
        <section className="rounded-xl border border-red-200 bg-white p-6 dark:border-red-900 dark:bg-gray-800">
          <h3 className="mb-1 text-sm font-semibold text-red-600">
            Delete {pendingDelete.name}?
          </h3>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            This permanently removes {pendingDelete.email}, their personal workspace
            and everything only they can see. Tasks they created in shared projects
            stay behind. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleDelete(pendingDelete)}
              disabled={busyId === pendingDelete.id}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busyId === pendingDelete.id ? 'Deleting…' : 'Permanently delete'}
            </button>
            <button
              onClick={() => setPendingDelete(null)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <CreateUserModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
}
