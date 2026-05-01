import { ExternalLink } from 'lucide-react';

const integrations = [
  {
    name: 'Google Calendar',
    description: 'Sync tasks with due dates to your Google Calendar.',
    status: 'coming_soon',
    icon: '📅',
  },
  {
    name: 'Outlook Calendar',
    description: 'Sync tasks with your Microsoft Outlook calendar.',
    status: 'coming_soon',
    icon: '📆',
  },
  {
    name: 'Slack',
    description: 'Get task notifications and reminders in Slack.',
    status: 'coming_soon',
    icon: '💬',
  },
  {
    name: 'GitHub',
    description: 'Link pull requests and issues to tasks.',
    status: 'coming_soon',
    icon: '🐙',
  },
];

export default function Integrations() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Integrations</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Connect Taskflow with your favourite tools.
        </p>
      </div>

      <div className="space-y-3">
        {integrations.map((integration) => (
          <div
            key={integration.name}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-4">
              <span className="text-2xl">{integration.icon}</span>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{integration.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{integration.description}</p>
              </div>
            </div>
            <span className="flex-shrink-0 text-xs px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full">
              Coming soon
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
        Want to suggest an integration?{' '}
        <a
          href="https://github.com/chris-billingham/taskflow/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#db4c3f] hover:underline flex items-center gap-0.5"
        >
          Open an issue <ExternalLink className="w-3 h-3" />
        </a>
      </p>
    </div>
  );
}
