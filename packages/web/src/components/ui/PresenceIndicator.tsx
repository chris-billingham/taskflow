import { useTaskPresence } from '@/hooks/useTaskPresence';

/** Who else has this task open right now. */
export function PresenceIndicator({ taskId, className = '' }: { taskId: string; className?: string }) {
  const viewers = useTaskPresence(taskId);
  if (viewers.length === 0) return null;

  const [first, second] = viewers;
  const text =
    viewers.length === 1
      ? `${first.name} is here too`
      : viewers.length === 2
        ? `${first.name} and ${second.name} are here too`
        : `${first.name} and ${viewers.length - 1} others are here too`;

  return (
    <div className={`flex items-center gap-1.5 ${className}`} role="status" aria-live="polite">
      <div className="flex -space-x-1.5" aria-hidden="true">
        {viewers.slice(0, 3).map((user) => (
          <span
            key={user.id}
            className="w-6 h-6 rounded-full bg-primary-500 text-white text-[10px] font-medium flex items-center justify-center ring-2 ring-white dark:ring-gray-800"
            title={user.name}
          >
            {user.name.charAt(0).toUpperCase()}
          </span>
        ))}
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{text}</span>
    </div>
  );
}
