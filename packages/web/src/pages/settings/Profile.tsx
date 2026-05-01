import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { AvatarUpload } from '@/components/settings/AvatarUpload';
import { TimezoneSelect } from '@/components/settings/TimezoneSelect';
import api from '@/services/api';

export default function Profile() {
  const { user, updateUser } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const { data } = await api.patch('/settings/preferences', { name: name.trim(), timezone });
      updateUser(data.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarSave = async (url: string | null) => {
    try {
      const { data } = await api.patch('/settings/preferences', { avatarUrl: url });
      updateUser(data.data);
    } catch {
      setError('Failed to update avatar');
    }
  };

  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Profile</h2>

      <div className="space-y-6">
        {/* Avatar */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Avatar</h3>
          <AvatarUpload
            name={user?.name ?? '?'}
            avatarUrl={user?.avatarUrl}
            onSave={handleAvatarSave}
          />
        </section>

        {/* Name & Email */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Personal info</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Full name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-[#db4c3f] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email address
            </label>
            <input
              type="email"
              value={user?.email ?? ''}
              disabled
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 cursor-not-allowed"
            />
            <p className="text-xs text-gray-400 mt-1">Email changes require verification</p>
          </div>
        </section>

        {/* Timezone */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Timezone</h3>
          <TimezoneSelect value={timezone} onChange={setTimezone} />
        </section>

        {/* Save */}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-[#db4c3f] text-white rounded-lg text-sm font-medium hover:bg-[#c53727] disabled:opacity-60 transition-colors"
        >
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
