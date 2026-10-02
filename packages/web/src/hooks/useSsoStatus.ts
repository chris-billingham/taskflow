import { useEffect, useState } from 'react';
import type { SsoStatus } from '@taskflow/contract';
import api from '@/services/api';

/** Whether this Taskflow offers single sign-on, and its name; null while unknown. */
export function useSsoStatus(): SsoStatus | null {
  const [status, setStatus] = useState<SsoStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get('/auth/sso')
      .then(({ data }) => {
        if (!cancelled) setStatus(data.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}
