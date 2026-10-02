import { create } from 'zustand';
import { del, get, set } from 'idb-keyval';
import type { QueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { toastError } from '@/stores/toastStore';
import { taskKeys } from './taskKeys';

/**
 * Changes made while offline, kept on this device (IndexedDB) and sent in
 * order when the connection comes back. Edits carry the task's version, so
 * one that someone else changed in the meantime is refused (409) rather than
 * overwriting their change; refused changes are dropped and the user is told.
 */

export interface OutboxEntry {
  id: string;
  method: 'post' | 'patch' | 'delete';
  url: string;
  body?: unknown;
  /** What the change was, in words: 'Complete "Buy milk"'. */
  label: string;
  /** New tasks don't show in lists until they're saved; the banner lists them. */
  adds?: boolean;
  queuedAt: number;
}

const KEY = 'taskflow-outbox';

interface OutboxState {
  userId: string | null;
  entries: OutboxEntry[];
  flushing: boolean;
}

export const useOutbox = create<OutboxState>(() => ({ userId: null, entries: [], flushing: false }));

async function save(entries: OutboxEntry[]) {
  useOutbox.setState({ entries });
  try {
    await set(KEY, { userId: useOutbox.getState().userId, entries });
  } catch {
    /* IndexedDB unavailable (private mode): the queue lasts as long as the tab */
  }
}

/** Load the queue saved for this user (a different user's is discarded). */
export async function loadOutbox(userId: string | null): Promise<void> {
  let saved: { userId: string | null; entries: OutboxEntry[] } | undefined;
  try {
    saved = await get(KEY);
  } catch {
    saved = undefined;
  }
  useOutbox.setState({ userId, entries: saved && saved.userId === userId ? saved.entries : [] });
}

export async function enqueue(entry: Omit<OutboxEntry, 'id' | 'queuedAt'>): Promise<void> {
  const full: OutboxEntry = { ...entry, id: crypto.randomUUID(), queuedAt: Date.now() };
  await save([...useOutbox.getState().entries, full]);
}

export async function clearOutbox(): Promise<void> {
  useOutbox.setState({ entries: [] });
  try {
    await del(KEY);
  } catch {
    /* nothing was saved */
  }
}

/** An error from no connection at all, as opposed to the server answering no. */
export function isNetworkError(err: unknown): boolean {
  const e = err as { response?: unknown; code?: string; isAxiosError?: boolean };
  return !!e && typeof e === 'object' && !e.response && (e.isAxiosError === true || e.code === 'ERR_NETWORK');
}

/**
 * Send queued changes in order. Stops at the first one that can't reach the
 * server (still offline) or that the server fails on (5xx), to try again
 * later; drops ones the server refuses (4xx), saying which.
 */
export async function flushOutbox(qc: QueryClient): Promise<void> {
  if (useOutbox.getState().flushing || useOutbox.getState().entries.length === 0) return;
  useOutbox.setState({ flushing: true });
  let sent = 0;
  try {
    while (useOutbox.getState().entries.length) {
      const [entry, ...rest] = useOutbox.getState().entries;
      try {
        await api.request({ method: entry.method, url: entry.url, data: entry.body });
        sent++;
      } catch (err) {
        const status = (err as { response?: { status?: number } }).response?.status;
        if (isNetworkError(err) || !status || status >= 500) break;
        const message = (err as { response?: { data?: { error?: string; message?: string } } }).response?.data;
        toastError(
          message?.error === 'VERSION_CONFLICT'
            ? `${entry.label} wasn't saved: someone changed it while you were offline.`
            : `${entry.label} wasn't saved: ${message?.message ?? 'the server refused it'}.`,
        );
      }
      await save(rest);
    }
  } finally {
    useOutbox.setState({ flushing: false });
    if (sent) void qc.invalidateQueries({ queryKey: taskKeys.all });
  }
}
