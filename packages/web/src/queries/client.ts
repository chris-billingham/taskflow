import { QueryClient } from '@tanstack/react-query';
import { PERSIST_MAX_AGE } from './persistence';

/**
 * Server data lives in TanStack Query. Websocket events patch and invalidate
 * the cache as changes happen elsewhere (see useRealTimeSync), so data can be
 * treated as fresh for a while rather than refetched on every mount.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        // Kept as long as the saved offline copy, so it can be restored.
        gcTime: PERSIST_MAX_AGE,
      },
    },
  });
}
