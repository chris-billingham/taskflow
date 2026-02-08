import { useState, useEffect } from 'react';
import { Bell, Mail, Smartphone } from 'lucide-react';
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed } from '@/services/notifications';

export default function NotificationSettings() {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailFrequency, setEmailFrequency] = useState<'immediate' | 'daily' | 'weekly'>('daily');

  // Notification type toggles
  const [enabledTypes, setEnabledTypes] = useState({
    taskAssigned: true,
    taskDueSoon: true,
    taskOverdue: true,
    commentOnTask: true,
    mentionInComment: true,
    projectShared: true,
    workspaceInvite: true,
  });

  useEffect(() => {
    isPushSubscribed().then(setPushEnabled);
  }, []);

  const handleTogglePush = async () => {
    setPushLoading(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
      } else {
        const success = await subscribeToPush();
        setPushEnabled(success);
      }
    } catch (err) {
      console.error('Failed to toggle push notifications:', err);
    } finally {
      setPushLoading(false);
    }
  };

  const toggleType = (key: keyof typeof enabledTypes) => {
    setEnabledTypes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const notificationTypes = [
    { key: 'taskAssigned' as const, label: 'Task assigned to you', description: 'When someone assigns a task to you' },
    { key: 'taskDueSoon' as const, label: 'Task due soon', description: 'Automatic reminder when a task is due soon' },
    { key: 'taskOverdue' as const, label: 'Task overdue', description: 'When a task passes its due date' },
    { key: 'commentOnTask' as const, label: 'Comment on your task', description: 'When someone comments on a task you created' },
    { key: 'mentionInComment' as const, label: '@mention in comment', description: 'When someone mentions you in a comment' },
    { key: 'projectShared' as const, label: 'Project shared with you', description: 'When someone shares a project with you' },
    { key: 'workspaceInvite' as const, label: 'Workspace invite', description: 'When you receive a workspace invitation' },
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Notification Settings</h1>

      {/* Push Notifications */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Smartphone className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-900">Push Notifications</h2>
        </div>
        <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
          <div>
            <p className="text-sm font-medium text-gray-900">Browser push notifications</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Receive notifications even when the app is in the background
            </p>
          </div>
          <button
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              pushEnabled ? 'bg-[#db4c3f]' : 'bg-gray-200'
            }`}
            onClick={handleTogglePush}
            disabled={pushLoading}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                pushEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </section>

      {/* Email Notifications */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-900">Email Notifications</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-900">Email notifications</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Receive notification summaries via email
              </p>
            </div>
            <button
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                emailEnabled ? 'bg-[#db4c3f]' : 'bg-gray-200'
              }`}
              onClick={() => setEmailEnabled(!emailEnabled)}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  emailEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {emailEnabled && (
            <div className="p-4 bg-white rounded-lg border border-gray-200">
              <p className="text-sm font-medium text-gray-900 mb-3">Email frequency</p>
              <div className="space-y-2">
                {(['immediate', 'daily', 'weekly'] as const).map((freq) => (
                  <label key={freq} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="emailFrequency"
                      value={freq}
                      checked={emailFrequency === freq}
                      onChange={() => setEmailFrequency(freq)}
                      className="text-[#db4c3f] focus:ring-[#db4c3f]"
                    />
                    <span className="text-sm text-gray-700 capitalize">{freq}</span>
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
          <Bell className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-900">Notification Types</h2>
        </div>
        <div className="space-y-1 bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
          {notificationTypes.map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-500">{description}</p>
              </div>
              <button
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  enabledTypes[key] ? 'bg-[#db4c3f]' : 'bg-gray-200'
                }`}
                onClick={() => toggleType(key)}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabledTypes[key] ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
