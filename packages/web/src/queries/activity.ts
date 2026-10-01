import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import type { Activity } from '@taskflow/contract';
import { errorMessage } from './tasks';

export type ActivityItem = Activity;
export type ActivityUser = Activity['user'];

export const activityKeys = {
  all: ['activity'] as const,
  task: (taskId: string) => ['activity', 'task', taskId] as const,
  project: (projectId: string) => ['activity', 'project', projectId] as const,
};

/** Everything that happened in a project, newest first, a page at a time. */
export function useProjectActivity(projectId: string, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: activityKeys.project(projectId),
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get(`/projects/${projectId}/activity`, {
        params: { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) },
      });
      return { items: data.data as Activity[], nextCursor: (data.nextCursor as string | null) ?? null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
  const activities = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  return {
    activities,
    loading: query.isLoading,
    error: errorMessage(query.error, 'Failed to load activity'),
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
  };
}

/**
 * A task's history, newest first. Task changes and comments invalidate it, so
 * it stays current while the panel is open.
 */
export function useTaskActivity(taskId: string) {
  const query = useQuery({
    queryKey: activityKeys.task(taskId),
    queryFn: async () => (await api.get(`/tasks/${taskId}/activity`)).data.data as Activity[],
  });
  return {
    activities: query.data ?? [],
    loading: query.isLoading,
    error: errorMessage(query.error, 'Failed to load activity'),
  };
}
