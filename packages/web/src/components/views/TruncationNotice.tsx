import { Info } from 'lucide-react';

interface TruncationNoticeProps {
  returned: number;
  total: number;
}

/**
 * Shown when a smart view hit the server's per-view cap.
 *
 * These views serialise nested subtasks, so the API caps them at 500 tasks.
 * Previously the count was derived from the capped array, so the badge simply
 * reported a smaller number and the surplus tasks were invisible with nothing
 * to indicate it. Saying so is the honest minimum until the lists are
 * paginated or virtualised.
 */
export function TruncationNotice({ returned, total }: TruncationNoticeProps) {
  if (total <= returned) return null;

  return (
    <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
      <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="text-xs text-amber-800 dark:text-amber-200">
        Showing the first {returned.toLocaleString()} of {total.toLocaleString()} tasks.
        Narrow the view with a filter or label to see the rest.
      </p>
    </div>
  );
}
