import { useMemo } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import api from '@/services/api';
import type { Task, TodayViewData, UpcomingViewData } from '@/types/task';
import { taskKeys } from './taskKeys';
import { findCachedTask, type TaskPage } from './taskCache';

/** The API's own message for a failed request, or a fallback. */
export function errorMessage(err: unknown, fallback: string): string | null {
  if (!err) return null;
  return (
    (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback
  );
}

async function fetchTaskPage(
  params: Record<string, string | undefined>,
  cursor: string | undefined,
): Promise<TaskPage> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.append(key, value);
  }
  if (cursor) search.append('cursor', cursor);
  const { data } = await api.get(`/tasks?${search.toString()}`);
  return { tasks: data.data as Task[], nextCursor: data.nextCursor ?? null };
}

function pagedResult(
  query: {
    data: InfiniteData<TaskPage> | undefined;
    isLoading: boolean;
    error: unknown;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => Promise<unknown>;
    refetch: () => Promise<unknown>;
  },
  tasks: Task[],
  fallback: string,
) {
  return {
    tasks,
    loading: query.isLoading,
    error: errorMessage(query.error, fallback),
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    refetch: () => void query.refetch(),
  };
}

/** A project's top-level tasks, a page at a time. */
export function useProjectTasks(projectId: string | undefined) {
  const query = useInfiniteQuery({
    queryKey: taskKeys.list({ projectId }),
    queryFn: ({ pageParam }) => fetchTaskPage({ projectId }, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(projectId),
  });
  const tasks = useMemo(
    () => query.data?.pages.flatMap((page) => page.tasks) ?? [],
    [query.data],
  );
  return pagedResult(query, tasks, 'Failed to load tasks');
}

/** Tasks matching a filter query (also used for a label's page), a page at a time. */
export function useFilterTasks(filterQuery: string | null) {
  const query = useInfiniteQuery({
    queryKey: taskKeys.filter(filterQuery ?? ''),
    queryFn: async ({ pageParam }): Promise<TaskPage> => {
      const { data } = await api.post('/filters/query', {
        query: filterQuery,
        ...(pageParam ? { cursor: pageParam } : {}),
      });
      return { tasks: data.data as Task[], nextCursor: data.nextCursor ?? null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(filterQuery),
  });
  const tasks = useMemo(
    () => query.data?.pages.flatMap((page) => page.tasks) ?? [],
    [query.data],
  );
  return pagedResult(query, tasks, 'Failed to run the filter');
}

/**
 * A task's subtasks, for rows whose data didn't embed them (project lists
 * only send a count). Fetched when the row is expanded.
 */
export function useSubtasks(parentId: string, enabled: boolean) {
  return useQuery({
    queryKey: taskKeys.subtasks(parentId),
    queryFn: async () => {
      const { data } = await api.get(`/tasks?parentId=${encodeURIComponent(parentId)}&limit=200`);
      return data.data as Task[];
    },
    enabled,
  });
}

export function useTodayView() {
  const query = useQuery({
    queryKey: taskKeys.today(),
    queryFn: async () => (await api.get('/views/today')).data.data as TodayViewData,
  });
  return {
    todayView: query.data ?? null,
    loading: query.isLoading,
    error: errorMessage(query.error, 'Failed to load Today'),
    refetch: () => void query.refetch(),
  };
}

export function useUpcomingView(days = 14, includeNoDate = true) {
  const query = useQuery({
    queryKey: taskKeys.upcoming(days, includeNoDate),
    queryFn: async () => {
      const params = new URLSearchParams({
        days: String(days),
        includeNoDate: includeNoDate ? 'true' : 'false',
      });
      return (await api.get(`/views/upcoming?${params.toString()}`)).data.data as UpcomingViewData;
    },
  });
  return {
    upcomingView: query.data ?? null,
    loading: query.isLoading,
    error: errorMessage(query.error, 'Failed to load Upcoming'),
    refetch: () => void query.refetch(),
  };
}

/**
 * One task with its project, section and subtasks. Opens instantly from any
 * cached copy while the full detail loads.
 */
export function useTaskDetail(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: taskKeys.detail(id ?? ''),
    queryFn: async () => (await api.get(`/tasks/${id}`)).data.data as Task,
    enabled: Boolean(id),
    placeholderData: () => (id ? findCachedTask(qc, id) : undefined),
    retry: false,
  });
}
