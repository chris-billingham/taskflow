import { CloudUpload, WifiOff } from 'lucide-react';
import { useOnline } from '@/hooks/useOnline';
import { useOutbox } from '@/queries/outbox';

const plural = (n: number) => (n === 1 ? '1 change' : `${n} changes`);

/**
 * Says so when there's no connection, and what's waiting to be saved: edits,
 * completions and deletions show at once; new tasks appear in lists once
 * they're saved, so they're named here meanwhile.
 */
export function OfflineBanner() {
  const online = useOnline();
  const entries = useOutbox((s) => s.entries);
  if (online && entries.length === 0) return null;
  const adds = entries.filter((e) => e.adds);

  return (
    <div
      role="status"
      className="flex flex-col items-center gap-1 px-4 py-2 text-sm bg-amber-50 text-amber-900 border-b border-amber-200 dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-800"
    >
      <p className="flex items-center gap-2 text-center">
        {online ? (
          <CloudUpload className="w-4 h-4 shrink-0" aria-hidden="true" />
        ) : (
          <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
        )}
        {online
          ? `Saving ${plural(entries.length)} made while offline…`
          : entries.length
            ? `You're offline. ${plural(entries.length)} will be saved when you reconnect.`
            : "You're offline. You're seeing what was last loaded; changes you make will be saved when you reconnect."}
      </p>
      {adds.length > 0 && (
        <ul className="text-xs text-amber-800 dark:text-amber-200">
          {adds.map((e) => (
            <li key={e.id}>{e.label}, waiting to be added</li>
          ))}
        </ul>
      )}
    </div>
  );
}
