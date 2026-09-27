import { QueryClient } from '@tanstack/react-query';

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
      },
    },
  });
}
