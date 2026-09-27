import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type { Filter } from '@taskflow/contract';
import type { Task } from '@/types/task';
import { errorMessage } from './tasks';
import { bySortOrder, mutateCachedList, patchById, removeById } from './optimistic';

export type { Filter };

export const filterKeys = { all: ['filters'] as const };

type FilterInput = {
  name: string;
  query: string;
  color?: string;
  viewStyle?: string;
};

/** The user's saved filters, in their order. */
export function useFilters() {
  const query = useQuery({
    queryKey: filterKeys.all,
    queryFn: async () => (await api.get('/filters')).data.data as Filter[],
  });
  const filters = useMemo(() => [...(query.data ?? [])].sort(bySortOrder), [query.data]);
  const favorites = useMemo(() => filters.filter((f) => f.isFavorite), [filters]);
  return {
    filters,
    favorites,
    loading: query.isLoading,
    error: errorMessage(query.error, 'Failed to load filters'),
  };
}

export function useFilterActions() {
  const qc = useQueryClient();
  return useMemo(() => {
    const mutate = <R,>(options: Parameters<typeof mutateCachedList<Filter, R>>[2]) =>
      mutateCachedList<Filter, R>(qc, filterKeys.all, options);
    return {
      createFilter: (input: FilterInput) =>
        mutate({
          request: async () => (await api.post('/filters', input)).data.data as Filter,
          failure: 'The filter could not be saved',
        }),
      updateFilter: (
        id: string,
        input: Partial<FilterInput & { isFavorite: boolean; sortOrder: number }>,
      ) =>
        mutate({
          apply: patchById<Filter>(id, input as Partial<Filter>),
          request: async () => (await api.patch(`/filters/${id}`, input)).data.data as Filter,
          failure: 'That change could not be saved',
        }),
      deleteFilter: (id: string) =>
        mutate({
          apply: removeById<Filter>(id),
          request: () => api.delete(`/filters/${id}`),
          failure: 'The filter could not be deleted',
        }),
      /** The first page of a query's results, for a preview. */
      previewFilter: async (query: string) =>
        (await api.post('/filters/query', { query })).data.data as Task[],
      validateFilter: async (query: string) =>
        (await api.post('/filters/validate', { query })).data.data as { valid: boolean; error?: string },
    };
  }, [qc]);
}
