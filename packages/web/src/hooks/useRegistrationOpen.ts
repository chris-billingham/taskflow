import { useEffect, useState } from 'react';
import api from '@/services/api';

/**
 * Whether anyone may sign up on this instance: true, false, or null while
 * unknown. A failed lookup reports null, so the page keeps offering sign-up
 * and the server stays the one that decides.
 */
export function useRegistrationOpen(): boolean | null {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get('/auth/registration')
      .then(({ data }) => {
        if (!cancelled) setOpen(Boolean(data.data.open));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return open;
}
