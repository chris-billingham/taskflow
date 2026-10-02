import { monitorEventLoopDelay } from 'node:perf_hooks';
import { RELEASE } from '../config/version.js';
import { checkDependencies, queueStats } from './systemStatus.js';
import { readHeartbeat, isFresh } from './workerHeartbeat.js';
import { getStats } from './adminService.js';

/**
 * GET /metrics in the Prometheus text format: dependencies, the worker,
 * queue depth and failures, accounts, and this process's memory and event
 * loop. Hand-written; it's a handful of gauges.
 */

const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

type Labels = Record<string, string>;

function escape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

class Exposition {
  private lines: string[] = [];

  gauge(name: string, help: string, samples: Array<[Labels, number]>): void {
    this.lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`);
    for (const [labels, value] of samples) {
      const keys = Object.keys(labels);
      const labelText = keys.length ? `{${keys.map((k) => `${k}="${escape(labels[k])}"`).join(',')}}` : '';
      this.lines.push(`${name}${labelText} ${Number.isFinite(value) ? value : 'NaN'}`);
    }
  }

  toString(): string {
    return this.lines.join('\n') + '\n';
  }
}

export async function renderMetrics(now = Date.now()): Promise<string> {
  const [{ checks }, heartbeat, queues, users] = await Promise.all([
    checkDependencies(),
    readHeartbeat().catch(() => null),
    queueStats().catch(() => []),
    getStats().catch(() => null),
  ]);
  const out = new Exposition();

  out.gauge('taskflow_info', 'The running release.', [[{ version: RELEASE.version, commit: RELEASE.commit ?? '' }, 1]]);
  out.gauge('taskflow_up', 'Whether each dependency answers (1) or not (0).', [
    [{ dependency: 'database' }, checks.database === 'ok' ? 1 : 0],
    [{ dependency: 'redis' }, checks.redis === 'ok' ? 1 : 0],
    [{ dependency: 'worker' }, isFresh(heartbeat, now) ? 1 : 0],
  ]);
  if (heartbeat) {
    out.gauge('taskflow_worker_heartbeat_age_seconds', 'Seconds since the worker last reported in.', [
      [{}, Math.max(0, (now - new Date(heartbeat.at).getTime()) / 1000)],
    ]);
  }
  out.gauge(
    'taskflow_queue_jobs',
    'Background jobs in each queue, by state. Each queue keeps only its latest 20 failures.',
    queues.flatMap((q) =>
      (['waiting', 'active', 'delayed', 'failed'] as const).map(
        (state): [Labels, number] => [{ queue: q.name, state }, q[state]],
      ),
    ),
  );
  if (users) {
    out.gauge('taskflow_users', 'Accounts, by state.', [
      [{ state: 'active' }, users.active],
      [{ state: 'suspended' }, users.suspended],
      [{ state: 'unverified' }, users.unverified],
    ]);
  }

  const memory = process.memoryUsage();
  out.gauge('process_resident_memory_bytes', 'Resident memory of the API process.', [[{}, memory.rss]]);
  out.gauge('nodejs_heap_used_bytes', 'V8 heap in use.', [[{}, memory.heapUsed]]);
  out.gauge('process_uptime_seconds', 'Seconds since the API process started.', [[{}, process.uptime()]]);
  out.gauge('nodejs_eventloop_delay_seconds', 'Event loop delay since the previous scrape.', [
    [{ quantile: '0.5' }, loopDelay.percentile(50) / 1e9],
    [{ quantile: '0.99' }, loopDelay.percentile(99) / 1e9],
  ]);
  loopDelay.reset();

  return out.toString();
}
