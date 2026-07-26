import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import type { SystemRole } from '@/stores/authStore';

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#db4c3f] dark:border-gray-600 dark:bg-gray-700 dark:text-white';

export interface CreateUserValues {
  email: string;
  name: string;
  password?: string;
  role: SystemRole;
}

export function CreateUserModal({
  isOpen,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: CreateUserValues) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<SystemRole>('USER');
  const [autoPassword, setAutoPassword] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setEmail('');
    setName('');
    setPassword('');
    setRole('USER');
    setAutoPassword(true);
    setError('');
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!autoPassword && password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        email: email.trim(),
        name: name.trim(),
        password: autoPassword ? undefined : password,
        role,
      });
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add user" size="md">
      <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
        <div>
          <label
            htmlFor="new-user-name"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Name
          </label>
          <input
            id="new-user-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label
            htmlFor="new-user-email"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Email
          </label>
          <input
            id="new-user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label
            htmlFor="new-user-role"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Role
          </label>
          <select
            id="new-user-role"
            value={role}
            onChange={(e) => setRole(e.target.value as SystemRole)}
            className={INPUT_CLASS}
          >
            <option value="USER">User</option>
            <option value="ADMIN">Administrator</option>
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Administrators manage accounts for the whole instance. They get no
            extra access to other people&apos;s tasks or projects.
          </p>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={autoPassword}
              onChange={(e) => setAutoPassword(e.target.checked)}
              className="rounded border-gray-300"
            />
            Generate a temporary password
          </label>

          {!autoPassword && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              aria-label="Password"
              className={INPUT_CLASS}
            />
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !email.trim() || !name.trim()}
            className="rounded-lg bg-[#db4c3f] px-5 py-2 text-sm font-medium text-white hover:bg-[#c53727] disabled:opacity-60"
          >
            {saving ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
