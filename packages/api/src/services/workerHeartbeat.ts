import { writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { RELEASE } from '../config/version.js';

/**
 * Whatever runs the background jobs (the worker container, or the API in
 * development) records that it's alive every few seconds. The API reads the
 * Redis copy for the admin console and /metrics; the worker container's
 * healthcheck reads the file, which is only touched after Redis accepted the
 * write, so a lost Redis connection or a blocked event loop both show up.
 */
const KEY = 'taskflow:worker:heartbeat';
export const HEARTBEAT_FILE = '/tmp/taskflow-worker-heartbeat';
const INTERVAL_MS = 15_000;
/** Older than this and the worker counts as down: four missed beats. */
export const HEARTBEAT_STALE_MS = 60_000;

export interface WorkerHeartbeat {
  at: string;
  version: string;
  host: string;
}

async function beat(): Promise<void> {
  const heartbeat: WorkerHeartbeat = { at: new Date().toISOString(), version: RELEASE.version, host: hostname() };
  try {
    await getRedis().set(KEY, JSON.stringify(heartbeat), 'PX', HEARTBEAT_STALE_MS * 2);
    await writeFile(HEARTBEAT_FILE, heartbeat.at);
  } catch (err) {
    logger.warn({ err }, 'worker heartbeat failed');
  }
}

/** Start beating; returns a function that stops. */
export function startHeartbeat(): () => void {
  void beat();
  const timer = setInterval(() => void beat(), INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

/** The latest heartbeat, or null if none has been recorded recently. */
export async function readHeartbeat(): Promise<WorkerHeartbeat | null> {
  const raw = await getRedis().get(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WorkerHeartbeat;
  } catch {
    return null;
  }
}

export function isFresh(heartbeat: WorkerHeartbeat | null, now = Date.now()): boolean {
  return !!heartbeat && now - new Date(heartbeat.at).getTime() < HEARTBEAT_STALE_MS;
}
