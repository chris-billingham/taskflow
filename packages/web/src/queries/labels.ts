import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type { Label } from '@taskflow/contract';
import { taskKeys } from './taskKeys';
import { errorMessage } from './tasks';
import { bySortOrder, mutateCachedList, patchById, removeById, reorderByIds } from './optimistic';

export type { Label };

export const labelKeys = {
  all: ['labels'] as const,
  project: (projectId: string) => ['labels', 'project', projectId] as const,
};

/**
 * The labels one project's tasks can use: its workspace's team labels, or
 * for a personal project its owner's labels (also when it's shared with you).
 */
export function useProjectLabels(projectId: string | undefined) {
  const query = useQuery({
    queryKey: labelKeys.project(projectId ?? ''),
    queryFn: async () => (await api.get('/labels', { params: { projectId } })).data.data as Label[],
    enabled: Boolean(projectId),
  });
  const labels = useMemo(() => [...(query.data ?? [])].sort(bySortOrder), [query.data]);
  return { labels, loading: query.isLoading };
}

/** Your labels and your workspaces' team labels, in your order. */
export function useLabels() {
  const query = useQuery({
    queryKey: labelKeys.all,
    queryFn: async () => (await api.get('/labels')).data.data as Label[],
  });
  const labels = useMemo(() => [...(query.data ?? [])].sort(bySortOrder), [query.data]);
  const favorites = useMemo(() => labels.filter((l) => l.isFavorite), [labels]);
  return {
    labels,
    favorites,
    loading: query.isLoading,
    error: errorMessage(query.error, 'Failed to load labels'),
  };
}

export function useLabelActions() {
  const qc = useQueryClient();
  return useMemo(() => {
    const mutate = <R,>(options: Parameters<typeof mutateCachedList<Label, R>>[2]) =>
      mutateCachedList<Label, R>(qc, labelKeys.all, options);
    // Tasks embed their labels' names and colours.
    const refreshTasks = () => void qc.invalidateQueries({ queryKey: taskKeys.all });

    return {
      /** In a workspace, in a project's space, or by default among your own. */
      createLabel: async (input: { name: string; color?: string; workspaceId?: string; projectId?: string }) => {
        try {
          return await mutate({
            request: async () => (await api.post('/labels', input)).data.data as Label,
            failure: 'The label could not be created',
          });
        } finally {
          // A project's list may hold it too.
          void qc.invalidateQueries({ queryKey: labelKeys.all });
        }
      },
      updateLabel: async (
        id: string,
        input: Partial<Pick<Label, 'name' | 'color' | 'isFavorite' | 'sortOrder'>>,
      ) => {
        const label = await mutate({
          apply: patchById<Label>(id, input),
          request: async () => (await api.patch(`/labels/${id}`, input)).data.data as Label,
          failure: 'That change could not be saved',
        });
        refreshTasks();
        return label;
      },
      deleteLabel: async (id: string) => {
        await mutate({
          apply: removeById<Label>(id),
          request: () => api.delete(`/labels/${id}`),
          failure: 'The label could not be deleted',
        });
        refreshTasks();
      },
      reorderLabels: (labelIds: string[]) =>
        mutate({
          apply: reorderByIds<Label>(labelIds),
          request: () => api.put('/labels/reorder', { labelIds }),
          failure: 'The new order could not be saved',
        }),
    };
  }, [qc]);
}
