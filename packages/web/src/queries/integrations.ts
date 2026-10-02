import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CalendarFeed, Webhook, WebhookEvent, WebhookWithSecret } from '@taskflow/contract';
import api from '@/services/api';
import { reportMutationError } from '@/utils/reportError';
import { errorMessage } from './tasks';

export const integrationKeys = {
  feeds: ['calendar-feeds'] as const,
  webhooks: (projectId: string) => ['webhooks', projectId] as const,
};

export function useCalendarFeeds() {
  const query = useQuery({
    queryKey: integrationKeys.feeds,
    queryFn: async () => (await api.get('/calendar-feeds')).data.data as CalendarFeed[],
  });
  return { feeds: query.data ?? [], loading: query.isLoading, error: errorMessage(query.error, 'Calendar feeds could not be loaded') };
}

export function useCalendarFeedActions() {
  const qc = useQueryClient();
  return useMemo(() => {
    const refresh = () => qc.invalidateQueries({ queryKey: integrationKeys.feeds });
    async function run<R>(request: () => Promise<R>, failure: string): Promise<R> {
      try {
        return await request();
      } catch (err) {
        reportMutationError(err, failure);
        throw err;
      } finally {
        void refresh();
      }
    }
    return {
      /** The feed for a project or filter, made the first time it's asked for. */
      open: (target: { projectId: string } | { filterId: string }) =>
        run(async () => (await api.post('/calendar-feeds', target)).data.data as CalendarFeed, 'The calendar feed could not be made'),
      reset: (id: string) =>
        run(async () => (await api.post(`/calendar-feeds/${id}/reset`)).data.data as CalendarFeed, 'The link could not be replaced'),
      remove: (id: string) => run(() => api.delete(`/calendar-feeds/${id}`), 'The calendar feed could not be removed'),
    };
  }, [qc]);
}

/** A project's webhooks; `forbidden` when you aren't one of its admins. */
export function useWebhooks(projectId: string) {
  const query = useQuery({
    queryKey: integrationKeys.webhooks(projectId),
    queryFn: async () => (await api.get(`/projects/${projectId}/webhooks`)).data.data as Webhook[],
    retry: false,
  });
  const status = (query.error as { response?: { status?: number } } | null)?.response?.status;
  return {
    webhooks: query.data ?? [],
    loading: query.isLoading,
    forbidden: status === 403,
    error: status === 403 ? null : errorMessage(query.error, 'Webhooks could not be loaded'),
  };
}

export function useWebhookActions(projectId: string) {
  const qc = useQueryClient();
  return useMemo(() => {
    async function run<R>(request: () => Promise<R>, failure: string): Promise<R> {
      try {
        return await request();
      } catch (err) {
        reportMutationError(err, failure);
        throw err;
      } finally {
        void qc.invalidateQueries({ queryKey: integrationKeys.webhooks(projectId) });
      }
    }
    return {
      create: (input: { url: string; events: WebhookEvent[] }) =>
        run(
          async () => (await api.post(`/projects/${projectId}/webhooks`, input)).data.data as WebhookWithSecret,
          'The webhook could not be added',
        ),
      update: (id: string, input: { url?: string; events?: WebhookEvent[]; isActive?: boolean }) =>
        run(async () => (await api.patch(`/webhooks/${id}`, input)).data.data as Webhook, 'The webhook could not be changed'),
      rotateSecret: (id: string) =>
        run(async () => (await api.post(`/webhooks/${id}/secret`)).data.data as WebhookWithSecret, 'The secret could not be replaced'),
      test: (id: string) =>
        run(
          async () => (await api.post(`/webhooks/${id}/test`)).data.data as { ok: boolean; status: number | null; error: string | null },
          'The test could not be sent',
        ),
      remove: (id: string) => run(() => api.delete(`/webhooks/${id}`), 'The webhook could not be deleted'),
    };
  }, [qc, projectId]);
}
