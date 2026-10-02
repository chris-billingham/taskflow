import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { WEBHOOK_EVENTS, type Webhook, type WebhookEvent } from '@taskflow/contract';
import { Modal } from '@/components/ui/Modal';
import { useWebhookActions, useWebhookDeliveries, useWebhooks } from '@/queries/integrations';

const EVENT_LABELS: Record<WebhookEvent, string> = {
  'task.created': 'Task added',
  'task.updated': 'Task changed',
  'task.completed': 'Task completed',
  'task.uncompleted': 'Task reopened',
  'task.deleted': 'Task deleted',
  'comment.created': 'Comment added',
  'comment.deleted': 'Comment deleted',
};

const button =
  'px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60';
const primary = 'px-3 py-1.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-60';

function Secret({ secret, onDone }: { secret: string; onDone: () => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/40">
      <p className="text-gray-800 dark:text-gray-200">
        Copy this signing secret into the receiving app now; it isn’t shown again. Each delivery’s{' '}
        <code>X-Taskflow-Signature</code> is an HMAC of it.
      </p>
      <code className="block break-all rounded bg-white px-2 py-1 font-mono text-xs dark:bg-gray-900">{secret}</code>
      <div className="flex gap-2">
        <button type="button" className={button} onClick={() => void navigator.clipboard?.writeText(secret)}>
          Copy
        </button>
        <button type="button" className={button} onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

function status(webhook: Webhook): { text: string; bad: boolean } {
  if (!webhook.isActive && webhook.failureCount > 0) return { text: 'Paused after repeated failures', bad: true };
  if (!webhook.isActive) return { text: 'Paused', bad: false };
  if (!webhook.lastDeliveryAt) return { text: 'Nothing sent yet', bad: false };
  const when = formatDistanceToNow(new Date(webhook.lastDeliveryAt), { addSuffix: true });
  return webhook.lastError
    ? { text: `Last delivery failed ${when}: ${webhook.lastError}`, bad: true }
    : { text: `Last delivered ${when}`, bad: false };
}

function Deliveries({ webhookId, projectId }: { webhookId: string; projectId: string }) {
  const { deliveries, loading } = useWebhookDeliveries(webhookId, true);
  const actions = useWebhookActions(projectId);
  if (loading) return <p className="text-xs text-gray-500 dark:text-gray-400">Loading…</p>;
  if (deliveries.length === 0) return <p className="text-xs text-gray-500 dark:text-gray-400">Nothing sent yet.</p>;
  return (
    <ul aria-label="Recent deliveries" className="max-h-60 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 text-xs dark:divide-gray-700 dark:border-gray-700">
      {deliveries.map((d) => {
        const ok = d.error === null;
        return (
          <li key={d.id} className="flex items-start gap-2 px-2 py-1.5">
            <span aria-hidden className={`mt-1 h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
            <div className="min-w-0 flex-1">
              <p className="text-gray-900 dark:text-gray-100">
                {EVENT_LABELS[d.event as WebhookEvent] ?? d.event}
                <span className="text-gray-500 dark:text-gray-400">
                  {' '}
                  · {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true })}
                  {d.attempt > 1 && ` · attempt ${d.attempt}`} · {d.durationMs} ms
                </span>
              </p>
              <p className={ok ? 'text-gray-500 dark:text-gray-400' : 'break-words text-red-600 dark:text-red-400'}>
                {ok ? `Delivered (${d.status})` : d.error}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded px-1.5 py-0.5 text-primary-600 hover:bg-gray-100 dark:text-primary-400 dark:hover:bg-gray-700"
              onClick={() => void actions.redeliver(webhookId, d.id)}
            >
              Resend
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function WebhookRow({ webhook, projectId, onSecret }: { webhook: Webhook; projectId: string; onSecret: (s: string) => void }) {
  const actions = useWebhookActions(projectId);
  const [result, setResult] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const s = status(webhook);
  return (
    <li className="space-y-2 py-3">
      <p className="break-all font-mono text-xs text-gray-900 dark:text-gray-100">{webhook.url}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{webhook.events.map((e) => EVENT_LABELS[e]).join(', ')}</p>
      <p className={`text-xs ${s.bad ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>{s.text}</p>
      {result && <p className="text-xs text-gray-700 dark:text-gray-300">{result}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          onClick={() =>
            void actions
              .test(webhook.id)
              .then((r) => setResult(r.ok ? `Test delivered (${r.status}).` : `Test failed: ${r.error}`))
          }
        >
          Send test
        </button>
        <button type="button" className={button} onClick={() => void actions.update(webhook.id, { isActive: !webhook.isActive })}>
          {webhook.isActive ? 'Pause' : 'Resume'}
        </button>
        <button type="button" className={button} onClick={() => void actions.rotateSecret(webhook.id).then((w) => onSecret(w.secret))}>
          New secret
        </button>
        <button type="button" className={`${button} text-red-600 dark:text-red-400`} onClick={() => void actions.remove(webhook.id)}>
          Delete
        </button>
        <button type="button" className={button} aria-expanded={showLog} onClick={() => setShowLog(!showLog)}>
          {showLog ? 'Hide deliveries' : 'Recent deliveries'}
        </button>
      </div>
      {showLog && <Deliveries webhookId={webhook.id} projectId={projectId} />}
    </li>
  );
}

/** A project's webhooks, for its admins. */
export function WebhooksDialog({ projectId, name, onClose }: { projectId: string; name: string; onClose: () => void }) {
  const { webhooks, loading, forbidden, error } = useWebhooks(projectId);
  const actions = useWebhookActions(projectId);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>(['task.created', 'task.completed']);
  const [secret, setSecret] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const created = await actions.create({ url: url.trim(), events });
      setSecret(created.secret);
      setUrl('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Webhooks: ${name}`} size="lg" className="max-h-[85vh] overflow-y-auto">
      <div className="space-y-4 p-6">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Taskflow sends a signed JSON request to each address when something happens in this project, for tools like
          n8n, Zapier or your own scripts.
        </p>
        {forbidden && (
          <p className="text-sm text-gray-700 dark:text-gray-300">Only this project’s admins can manage its webhooks.</p>
        )}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {secret && <Secret secret={secret} onDone={() => setSecret(null)} />}

        {!forbidden && !loading && (
          <>
            {webhooks.length > 0 && (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {webhooks.map((w) => (
                  <WebhookRow key={w.id} webhook={w} projectId={projectId} onSecret={setSecret} />
                ))}
              </ul>
            )}

            <form onSubmit={(e) => void add(e)} className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Add a webhook</h3>
              <div>
                <label htmlFor="webhook-url" className="mb-1 block text-sm text-gray-700 dark:text-gray-300">
                  Address
                </label>
                <input
                  id="webhook-url"
                  type="url"
                  required
                  placeholder="https://example.com/hooks/taskflow"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <fieldset>
                <legend className="mb-1 text-sm text-gray-700 dark:text-gray-300">Send when</legend>
                <div className="grid grid-cols-2 gap-1">
                  {WEBHOOK_EVENTS.map((event) => (
                    <label key={event} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        className="accent-primary-500"
                        checked={events.includes(event)}
                        onChange={(e) => setEvents(e.target.checked ? [...events, event] : events.filter((x) => x !== event))}
                      />
                      {EVENT_LABELS[event]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button type="submit" className={primary} disabled={adding || !url.trim() || events.length === 0}>
                Add webhook
              </button>
            </form>
          </>
        )}
      </div>
    </Modal>
  );
}
