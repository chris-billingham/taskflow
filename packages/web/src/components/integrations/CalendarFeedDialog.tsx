import { useEffect, useState } from 'react';
import type { CalendarFeed } from '@taskflow/contract';
import { Modal } from '@/components/ui/Modal';
import { useCalendarFeedActions } from '@/queries/integrations';

const button =
  'px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60';

/** The private calendar link for a project or filter, made when first opened. */
export function CalendarFeedDialog({
  target,
  name,
  onClose,
}: {
  target: { projectId: string } | { filterId: string };
  name: string;
  onClose: () => void;
}) {
  const actions = useCalendarFeedActions();
  const [feed, setFeed] = useState<CalendarFeed | null>(null);
  const [copied, setCopied] = useState(false);
  const targetKey = 'projectId' in target ? target.projectId : target.filterId;

  useEffect(() => {
    let cancelled = false;
    actions
      .open(target)
      .then((f) => !cancelled && setFeed(f))
      .catch(() => !cancelled && onClose());
    return () => {
      cancelled = true;
    };
    // Opened once per project or filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  const copy = async () => {
    if (!feed) return;
    await navigator.clipboard?.writeText(feed.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen onClose={onClose} title={`Calendar feed: ${name}`} size="lg">
      <div className="space-y-4 p-6">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Subscribe to this link in Apple Calendar, Google Calendar or Outlook to see the open tasks with a due date
          or deadline. It updates by itself, usually within an hour.
        </p>
        <div className="flex gap-2">
          <input
            aria-label="Calendar feed link"
            readOnly
            value={feed?.url ?? 'Making a link…'}
            onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 font-mono text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          <button type="button" className={button} disabled={!feed} onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Anyone with this link can see these tasks, so keep it to yourself. If it gets out, make a new one: the old
          link stops working.
        </p>
        <div className="flex flex-wrap gap-2">
          {feed && (
            <a className={button} href={feed.url.replace(/^https?:/, 'webcal:')}>
              Open in calendar app
            </a>
          )}
          <button type="button" className={button} disabled={!feed} onClick={() => feed && void actions.reset(feed.id).then(setFeed)}>
            Make a new link
          </button>
          <button
            type="button"
            className={`${button} text-red-600 dark:text-red-400`}
            disabled={!feed}
            onClick={() => feed && void actions.remove(feed.id).then(onClose)}
          >
            Stop sharing
          </button>
        </div>
      </div>
    </Modal>
  );
}
