import { formatDistanceToNow } from 'date-fns';
import { RotateCcw, Trash2 } from 'lucide-react';
import type { AdminFailedJob } from '@taskflow/contract';
import { IconButton } from '@/components/ui/IconButton';
import { useFailedJobActions, useFailedJobs, useSystemStatus } from '@/queries/admin';

const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true });

// What each queue does, in the words an admin would use.
const QUEUE_LABELS: Record<string, string> = {
  'reminder-check': 'Reminders',
  'notification-digest': 'Email digests',
  'due-task-check': 'Due and overdue notices',
  'notification-delivery': 'Email and push delivery',
  maintenance: 'Nightly cleanup',
};
const queueLabel = (name: string) => QUEUE_LABELS[name] ?? name;

function Status({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span
        aria-hidden
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {label} <span className="sr-only">{ok ? 'working' : 'not working'}</span>
        </p>
        {detail && <p className="text-xs text-gray-500 dark:text-gray-400">{detail}</p>}
      </div>
    </div>
  );
}

function FailedJobRow({ job }: { job: AdminFailedJob }) {
  const { retry, discard } = useFailedJobActions();
  return (
    <li className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-900 dark:text-white">
          {queueLabel(job.queue)}
          <span className="text-gray-500 dark:text-gray-400"> · {job.name}</span>
        </p>
        <p className="break-words text-xs text-red-600 dark:text-red-400">{job.reason || 'No reason recorded'}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {job.attempts} {job.attempts === 1 ? 'attempt' : 'attempts'}
          {job.failedAt && ` · failed ${ago(job.failedAt)}`}
        </p>
      </div>
      <IconButton label={`Run ${job.name} again`} onClick={() => void retry(job)}>
        <RotateCcw className="h-4 w-4" />
      </IconButton>
      <IconButton label={`Discard ${job.name}`} tone="danger" onClick={() => void discard(job)}>
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </li>
  );
}

/** The admin console's view of the running instance. */
export function SystemStatus() {
  const { system, error } = useSystemStatus();
  const { jobs } = useFailedJobs();

  return (
    <section
      aria-labelledby="system-heading"
      className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="system-heading" className="text-sm font-semibold text-gray-900 dark:text-white">
          System
        </h3>
        {system && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Taskflow {system.version}
            {system.commit && <span title={system.commit}> ({system.commit.slice(0, 7)})</span>}
          </p>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {system && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Status ok={system.database === 'ok'} label="Database" />
            <Status ok={system.redis === 'ok'} label="Redis" />
            <Status
              ok={system.worker.status === 'ok'}
              label="Background jobs"
              detail={
                system.worker.lastSeen
                  ? `Worker last seen ${ago(system.worker.lastSeen)}`
                  : 'The worker hasn’t reported in. Reminders and email aren’t being sent.'
              }
            />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <caption className="sr-only">Background job queues</caption>
              <thead className="text-xs text-gray-500 dark:text-gray-400">
                <tr>
                  <th scope="col" className="py-1 pr-3 font-medium">Queue</th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">Waiting</th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">Running</th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">Scheduled</th>
                  <th scope="col" className="py-1 text-right font-medium">Failed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {system.queues.map((q) => (
                  <tr key={q.name} className="text-gray-900 dark:text-gray-100">
                    <th scope="row" className="py-1 pr-3 font-normal">{queueLabel(q.name)}</th>
                    <td className="py-1 pr-3 text-right">{q.waiting}</td>
                    <td className="py-1 pr-3 text-right">{q.active}</td>
                    <td className="py-1 pr-3 text-right">{q.delayed}</td>
                    <td className={`py-1 text-right ${q.failed ? 'font-semibold text-red-600 dark:text-red-400' : ''}`}>
                      {q.failed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {jobs.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Failed jobs
          </h4>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {jobs.map((job) => (
              <FailedJobRow key={`${job.queue}:${job.id}`} job={job} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
