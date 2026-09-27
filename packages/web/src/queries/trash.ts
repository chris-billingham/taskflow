import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import type { TrashedTask } from '@taskflow/contract';
import { errorMessage } from './tasks';
import { trashKeys } from './taskActions';

export type { TrashedTask };

/** Tasks in the trash, newest first. Restore and delete-forever are task actions. */
export function useTrash() {
  const query = useQuery({
    queryKey: trashKeys.all,
    queryFn: async () => (await api.get('/tasks/trash')).data.data as TrashedTask[],
  });
  return {
    tasks: query.data ?? [],
    loading: query.isLoading,
    error: errorMessage(query.error, 'Failed to load the trash'),
  };
}
