import { useEffect, useState } from 'react';
import { clearLinkToken, readLinkToken } from '@/utils/linkToken';

/**
 * The one-time token from an emailed link, read once on mount and then removed
 * from the address bar. The read stays pure (StrictMode calls initialisers
 * twice); the scrub happens in an effect, where repeating it is harmless.
 */
export function useLinkToken(): string | null {
  const [token] = useState(() => readLinkToken(window.location));
  useEffect(() => {
    if (token) clearLinkToken();
  }, [token]);
  return token;
}
