import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type { AdminFailedJob, AdminSystem } from '@taskflow/contract';
import { reportMutationError } from '@/utils/reportError';
import { errorMessage } from './tasks';

export const adminKeys = {
  system: ['admin', 'system'] as const,
  failedJobs: ['admin', 'failed-jobs'] as const,
};

const REFRESH_MS = 30_000;

/** Release, dependencies, worker and queues; refreshed while the page is open. */
export function useSystemStatus() {
  const query = useQuery({
    queryKey: adminKeys.system,
    queryFn: async () => (await api.get('/admin/system')).data.data as AdminSystem,
    refetchInterval: REFRESH_MS,
    staleTime: 0,
  });
  return { system: query.data, loading: query.isLoading, error: errorMessage(query.error, 'System status could not be loaded') };
}

export function useFailedJobs() {
  const query = useQuery({
    queryKey: adminKeys.failedJobs,
    queryFn: async () => (await api.get('/admin/jobs/failed')).data.data as AdminFailedJob[],
    refetchInterval: REFRESH_MS,
    staleTime: 0,
  });
  return { jobs: query.data ?? [], loading: query.isLoading };
}

export function useFailedJobActions() {
  const qc = useQueryClient();
  return useMemo(() => {
    async function run(request: () => Promise<unknown>, failure: string) {
      try {
        await request();
      } catch (err) {
        reportMutationError(err, failure);
      } finally {
        await Promise.all([
          qc.invalidateQueries({ queryKey: adminKeys.failedJobs }),
          qc.invalidateQueries({ queryKey: adminKeys.system }),
        ]);
      }
    }
    const path = (job: AdminFailedJob) => `/admin/jobs/${encodeURIComponent(job.queue)}/${encodeURIComponent(job.id)}`;
    return {
      retry: (job: AdminFailedJob) => run(() => api.post(`${path(job)}/retry`), 'That job could not be retried'),
      discard: (job: AdminFailedJob) => run(() => api.delete(path(job)), 'That job could not be discarded'),
    };
  }, [qc]);
}
