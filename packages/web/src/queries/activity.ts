import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import type { Activity } from '@taskflow/contract';
import { errorMessage } from './tasks';

export type ActivityItem = Activity;
export type ActivityUser = Activity['user'];

export const activityKeys = {
  all: ['activity'] as const,
  task: (taskId: string) => ['activity', 'task', taskId] as const,
};

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
