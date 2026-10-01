import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type { ApiToken, CreatedApiToken, Session } from '@taskflow/contract';
import { reportMutationError } from '@/utils/reportError';
import { errorMessage } from './tasks';

export const sessionKeys = {
  sessions: ['sessions'] as const,
  tokens: ['api-tokens'] as const,
};

/** The devices you're signed in on, this one first. */
export function useSessions() {
  const query = useQuery({
    queryKey: sessionKeys.sessions,
    queryFn: async () => (await api.get('/sessions')).data.data as Session[],
  });
  return { sessions: query.data ?? [], loading: query.isLoading, error: errorMessage(query.error, 'Sessions could not be loaded') };
}

/** Your personal access tokens. */
export function useApiTokens() {
  const query = useQuery({
    queryKey: sessionKeys.tokens,
    queryFn: async () => (await api.get('/tokens')).data.data as ApiToken[],
  });
  return { tokens: query.data ?? [], loading: query.isLoading, error: errorMessage(query.error, 'Tokens could not be loaded') };
}

export function useSessionActions() {
  const qc = useQueryClient();
  return useMemo(() => {
    async function run<R>(request: () => Promise<R>, failure: string | null, key: readonly string[]): Promise<R> {
      try {
        return await request();
      } catch (err) {
        if (failure) reportMutationError(err, failure);
        throw err;
      } finally {
        void qc.invalidateQueries({ queryKey: key });
      }
    }
    return {
      revokeSession: (id: string) =>
        run(() => api.delete(`/sessions/${id}`), 'That device could not be signed out', sessionKeys.sessions),
      revokeOtherSessions: () =>
        run(() => api.delete('/sessions'), 'Your other devices could not be signed out', sessionKeys.sessions),
      /** Throws without a toast: the dialog shows its own error. */
      createToken: (input: { name: string; scope: 'READ' | 'WRITE'; expiresInDays?: number }) =>
        run(async () => (await api.post('/tokens', input)).data.data as CreatedApiToken, null, sessionKeys.tokens),
      revokeToken: (id: string) => run(() => api.delete(`/tokens/${id}`), 'The token could not be revoked', sessionKeys.tokens),
    };
  }, [qc]);
}
