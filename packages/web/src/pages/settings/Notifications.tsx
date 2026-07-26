import { useState, useEffect } from 'react';
import { Bell, Mail, Smartphone } from 'lucide-react';
import {
  subscribeToPush,
  unsubscribeFromPush,
  isPushSubscribed,
  getVapidPublicKey,
} from '@/services/notifications';
import api from '@/services/api';
import { toastError } from '@/stores/toastStore';

// Server-side NotificationType enum values for the mutable types.
//
// PROJECT_SHARED is deliberately absent: there is no per-project sharing in the
// product (ProjectMember rows are read but never written — access comes from
// workspace membership), so nothing can ever emit it. The server still accepts
// the value so anyone who muted it before it was hidden can still save.
const NOTIFICATION_TYPES = [
  { key: 'TASK_ASSIGNED', label: 'Task assigned to you', description: 'When someone assigns a task to you' },
  { key: 'TASK_DUE_SOON', label: 'Task due soon', description: 'When a task you own is due today, or within the hour if it has a time' },
  { key: 'TASK_OVERDUE', label: 'Task overdue', description: 'When a task passes its due date' },
  { key: 'COMMENT_ON_TASK', label: 'Comment on your task', description: 'When someone comments on a task you created, are assigned, or replied to' },
  { key: 'MENTION_IN_COMMENT', label: '@mention in comment', description: 'When someone writes @your-name in a comment' },
  { key: 'WORKSPACE_INVITE', label: 'Workspace invite', description: 'When you receive a workspace invitation' },
] as const;

type NotificationTypeKey = (typeof NOTIFICATION_TYPES)[number]['key'];

interface Prefs {
  emailEnabled: boolean;
  emailFrequency: 'immediate' | 'daily' | 'weekly';
  // string[], not NotificationTypeKey[]: the server may legitimately return a
  // muted type this page no longer renders a toggle for, and it must survive
  // the round-trip rather than being silently dropped on the next save.
  disabledTypes: string[];
}

function Toggle({
  on,
  onClick,
  disabled,
  label,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
        on ? 'bg-[#db4c3f]' : 'bg-gray-200 dark:bg-gray-600'
      }`}
      onClick={onClick}
      disabled={disabled}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-800 transition-transform ${
          on ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function NotificationSettings() {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushAvailable, setPushAvailable] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    isPushSubscribed().then(setPushEnabled);
    getVapidPublicKey().then((key) => setPushAvailable(!!key));
    api
      .get('/settings/notifications')
      .then(({ data }) => setPrefs(data.data))
      .catch(() => toastError('Failed to load notification preferences'));
  }, []);

  // Optimistic save: flip locally, persist, roll back + toast on failure.
  const savePrefs = async (next: Prefs) => {
    const previous = prefs;
    setPrefs(next);
    try {
      await api.put('/settings/notifications', next);
    } catch {
      setPrefs(previous);
      toastError('Failed to save notification preferences');
    }
  };

  const handleTogglePush = async () => {
    setPushLoading(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
      } else {
        const success = await subscribeToPush();
        setPushEnabled(success);
        if (!success) {
          toastError('Could not enable push notifications — check browser permissions');
        }
      }
    } catch (err) {
      console.error('Failed to toggle push notifications:', err);
      toastError('Could not change push notification state');
    } finally {
      setPushLoading(false);
    }
  };

  const toggleType = (key: NotificationTypeKey) => {
    if (!prefs) return;
    const disabled = prefs.disabledTypes.includes(key);
    void savePrefs({
      ...prefs,
      disabledTypes: disabled
        ? prefs.disabledTypes.filter((t) => t !== key)
        : [...prefs.disabledTypes, key],
    });
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Notification Settings</h1>

      {/* Push Notifications */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Smartphone className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Push Notifications</h2>
        </div>
        <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Browser push notifications</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {pushAvailable === false
                ? 'Not available: this server has no VAPID keys configured (see .env.example)'
                : 'Receive notifications even when the app is in the background'}
            </p>
          </div>
          {pushAvailable !== false && (
            <Toggle
              on={pushEnabled}
              onClick={handleTogglePush}
              disabled={pushLoading || pushAvailable === null}
              label="Browser push notifications"
            />
          )}
        </div>
      </section>

      {/* Email Notifications */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Email Notifications</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Email notifications</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Receive notification summaries via email
              </p>
            </div>
            <Toggle
              on={prefs?.emailEnabled ?? true}
              onClick={() => prefs && savePrefs({ ...prefs, emailEnabled: !prefs.emailEnabled })}
              disabled={!prefs}
              label="Email notifications"
            />
          </div>

          {prefs?.emailEnabled && (
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">Email frequency</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Immediate emails each notification as it happens; daily and weekly send a digest of unread notifications.
              </p>
              <div className="space-y-2">
                {(['immediate', 'daily', 'weekly'] as const).map((freq) => (
                  <label key={freq} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="emailFrequency"
                      value={freq}
                      checked={prefs.emailFrequency === freq}
                      onChange={() => savePrefs({ ...prefs, emailFrequency: freq })}
                      className="text-[#db4c3f] focus:ring-[#db4c3f]"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">{freq}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Notification Types */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Notification Types</h2>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Muted types are suppressed everywhere: in-app, push and email.
          Reminders you set on tasks always fire.
        </p>
        <div className="space-y-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
          {NOTIFICATION_TYPES.map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
              </div>
              <Toggle
                on={!prefs?.disabledTypes.includes(key)}
                onClick={() => toggleType(key)}
                disabled={!prefs}
                label={label}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
