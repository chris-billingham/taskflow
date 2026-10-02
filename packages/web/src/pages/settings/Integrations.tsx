import { useState } from 'react';
import { Link } from 'react-router';
import { ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useCalendarFeedActions, useCalendarFeeds } from '@/queries/integrations';

const section = 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-3';
const button =
  'px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700';

function CalendarFeeds() {
  const { feeds, loading, error } = useCalendarFeeds();
  const actions = useCalendarFeedActions();
  const [copied, setCopied] = useState<string | null>(null);

  return (
    <section aria-labelledby="feeds-heading" className={section}>
      <h3 id="feeds-heading" className="text-sm font-semibold text-gray-900 dark:text-white">
        Calendar feeds
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Private links that show a project’s or a filter’s dated tasks in your calendar app. To make one, open the
        project and choose <strong>Calendar feed</strong> from its menu, or use the calendar button on a filter.
      </p>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!loading && feeds.length > 0 && (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {feeds.map((feed) => (
            <li key={feed.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="text-sm text-gray-900 dark:text-white">{feed.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {feed.projectId ? 'Project' : 'Filter'} ·{' '}
                  {feed.lastFetchedAt
                    ? `last read by a calendar ${formatDistanceToNow(new Date(feed.lastFetchedAt), { addSuffix: true })}`
                    : 'not subscribed to yet'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    void navigator.clipboard?.writeText(feed.url);
                    setCopied(feed.id);
                  }}
                >
                  {copied === feed.id ? 'Copied' : 'Copy link'}
                </button>
                <button type="button" className={`${button} text-red-600 dark:text-red-400`} onClick={() => void actions.remove(feed.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Integrations() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Integrations</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Connect Taskflow with your calendar and other tools.</p>
      </div>

      <CalendarFeeds />

      <section aria-labelledby="webhooks-heading" className={section}>
        <h3 id="webhooks-heading" className="text-sm font-semibold text-gray-900 dark:text-white">
          Webhooks
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Send a project’s events (tasks added or completed, comments) to n8n, Zapier or your own scripts. A project’s
          admins set them up from the project’s menu: <strong>Webhooks</strong>.
        </p>
      </section>

      <section aria-labelledby="api-heading" className={section}>
        <h3 id="api-heading" className="text-sm font-semibold text-gray-900 dark:text-white">
          API
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Scripts can use the Taskflow API with a{' '}
          <Link to="/settings/devices" className="text-primary-500 hover:underline">
            personal access token
          </Link>
          .
        </p>
      </section>

      <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
        Want to suggest an integration?{' '}
        <a
          href="https://github.com/chris-billingham/taskflow/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-500 hover:underline flex items-center gap-0.5"
        >
          Open an issue <ExternalLink className="w-3 h-3" />
        </a>
      </p>
    </div>
  );
}
