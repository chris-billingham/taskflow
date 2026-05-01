import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-[#db4c3f]' : 'bg-gray-200 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function Account() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleChangePassword = async () => {
    setPwError('');
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match'); return; }
    if (newPassword.length < 8) { setPwError('Password must be at least 8 characters'); return; }
    setPwSaving(true);
    try {
      await api.patch('/users/me/password', { currentPassword, newPassword });
      setPwSuccess(true);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setPwError(msg ?? 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete('/settings/data');
      await logout();
      navigate('/login');
    } catch {
      setDeleteError('Failed to delete account. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Account</h2>

      {/* Change password */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Change password</h3>

        {[
          { label: 'Current password', value: currentPassword, set: setCurrentPassword },
          { label: 'New password', value: newPassword, set: setNewPassword },
          { label: 'Confirm new password', value: confirmPassword, set: setConfirmPassword },
        ].map(({ label, value, set }) => (
          <div key={label}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
            <input
              type="password"
              value={value}
              onChange={(e) => set(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-[#db4c3f] focus:border-transparent"
            />
          </div>
        ))}

        {pwError && <p className="text-sm text-red-600">{pwError}</p>}
        {pwSuccess && <p className="text-sm text-green-600">Password changed successfully.</p>}

        <button
          onClick={handleChangePassword}
          disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword}
          className="px-5 py-2 bg-[#db4c3f] text-white rounded-lg text-sm font-medium hover:bg-[#c53727] disabled:opacity-60 transition-colors"
        >
          {pwSaving ? 'Saving…' : 'Update password'}
        </button>
      </section>

      {/* Two-factor (placeholder) */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Two-factor authentication</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Add an extra layer of security (coming soon)</p>
          </div>
          <Toggle checked={false} onChange={() => {}} />
        </div>
      </section>

      {/* Delete account */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-red-200 dark:border-red-900 p-6">
        <h3 className="text-sm font-semibold text-red-600 mb-1">Delete account</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Permanently delete your account and all associated data. This cannot be undone.
        </p>

        {!deleteOpen ? (
          <button
            onClick={() => setDeleteOpen(true)}
            className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Delete account
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Type <strong>DELETE</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== 'DELETE' || deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deleting…' : 'Permanently delete'}
              </button>
              <button
                onClick={() => { setDeleteOpen(false); setDeleteConfirm(''); }}
                className="px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
