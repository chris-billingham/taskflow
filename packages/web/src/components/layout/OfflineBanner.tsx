import { WifiOff } from 'lucide-react';
import { useOnline } from '@/hooks/useOnline';

/** Says so when there's no connection: what you see may be out of date, and changes can't be saved. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 px-4 py-2 text-sm bg-amber-50 text-amber-900 border-b border-amber-200 dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-800"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      You're offline. You're seeing what was last loaded, and changes can't be saved until you reconnect.
    </div>
  );
}
