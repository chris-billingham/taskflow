import { useCallback, useRef, useState } from 'react';
import { useFilterStore } from '@/stores/filterStore';
import type { Task } from '@/stores/taskStore';

/**
 * The tasks matching a filter query, a page at a time, for the Filter and
 * Label pages. `refetch` (run after every edit on those pages) reloads as many
 * pages as were showing, so completing a task doesn't collapse the list back
 * to its first page.
 */
export function useFilterResults(query: string | null) {
  const executeFilter = useFilterStore((s) => s.executeFilter);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const pagesShown = useRef(1);
  const lastQuery = useRef<string | null>(null);
  // Bumped by every refetch; a response for an older one is dropped.
  const seq = useRef(0);

  const refetch = useCallback(async () => {
    if (!query) return;
    if (query !== lastQuery.current) {
      lastQuery.current = query;
      pagesShown.current = 1;
    }
    const mySeq = ++seq.current;
    setLoading(true);
    try {
      let all: Task[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page = await executeFilter(query, cursor ?? undefined);
        all = all.concat(page.tasks);
        cursor = page.nextCursor;
        pages++;
      } while (cursor && pages < pagesShown.current);
      if (mySeq !== seq.current) return;
      setTasks(all);
      setNextCursor(cursor);
      pagesShown.current = pages;
    } catch {
      if (mySeq !== seq.current) return;
      setTasks([]);
      setNextCursor(null);
    } finally {
      if (mySeq === seq.current) setLoading(false);
    }
  }, [query, executeFilter]);

  const loadMore = useCallback(async () => {
    if (!query || !nextCursor || loadingMore) return;
    const mySeq = seq.current;
    setLoadingMore(true);
    try {
      const page = await executeFilter(query, nextCursor);
      if (mySeq !== seq.current) return;
      setTasks((prev) => [...prev, ...page.tasks]);
      setNextCursor(page.nextCursor);
      pagesShown.current += 1;
    } finally {
      setLoadingMore(false);
    }
  }, [query, nextCursor, loadingMore, executeFilter]);

  return { tasks, loading, hasMore: nextCursor !== null, loadingMore, loadMore, refetch };
}
