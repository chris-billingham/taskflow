import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { reportMutationError } from '@/utils/reportError';

/**
 * Change a cached list optimistically: apply the change, send the request,
 * roll back (and tell the user) on failure, and refetch afterwards so the
 * cache ends up exactly as the server has it.
 */
export async function mutateCachedList<T, R>(
  qc: QueryClient,
  key: QueryKey,
  options: {
    apply?: (list: T[]) => T[];
    request: () => Promise<R>;
    failure: string;
  },
): Promise<R> {
  await qc.cancelQueries({ queryKey: key });
  const previous = qc.getQueryData<T[]>(key);
  if (previous && options.apply) qc.setQueryData<T[]>(key, options.apply(previous));
  try {
    return await options.request();
  } catch (err) {
    qc.setQueryData(key, previous);
    reportMutationError(err, options.failure);
    throw err;
  } finally {
    void qc.invalidateQueries({ queryKey: key });
  }
}

/** Replace the item with this id, merging in the change. */
export const patchById =
  <T extends { id: string }>(id: string, change: Partial<T>) =>
  (list: T[]): T[] =>
    list.map((item) => (item.id === id ? { ...item, ...change } : item));

export const removeById =
  <T extends { id: string }>(id: string) =>
  (list: T[]): T[] =>
    list.filter((item) => item.id !== id);

/** Give the listed items sortOrder 0..n in that order. */
export const reorderByIds =
  <T extends { id: string; sortOrder: number }>(ids: string[]) =>
  (list: T[]): T[] => {
    const order = new Map(ids.map((id, index) => [id, index]));
    return list.map((item) => (order.has(item.id) ? { ...item, sortOrder: order.get(item.id)! } : item));
  };

export const bySortOrder = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;
