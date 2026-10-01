import { History, Loader2, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { IconButton } from '@/components/ui/IconButton';
import { useProjectActivity } from '@/queries/activity';
import { useOpenTask } from '@/hooks/useTaskPanel';
import { ActivityItemComponent } from './ActivityItem';

/** What everyone has been doing in a project, newest first. */
export function ProjectActivity({ project, onClose }: { project: { id: string; name: string }; onClose: () => void }) {
  const { activities, loading, error, hasMore, loadingMore, loadMore } = useProjectActivity(project.id);
  const openTask = useOpenTask();

  return (
    <Sheet onClose={onClose} label="Project activity">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <History className="w-4 h-4" aria-hidden="true" />
          Activity in {project.name}
        </h2>
        <IconButton label="Close activity" onClick={onClose}>
          <X className="w-5 h-5" />
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : activities.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Nothing has happened here yet.</p>
        ) : (
          <>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {activities.map((a) => (
                <ActivityItemComponent
                  key={a.id}
                  activity={a}
                  onOpenTask={(taskId) => {
                    onClose();
                    openTask(taskId);
                  }}
                />
              ))}
            </div>
            {hasMore && (
              <button
                type="button"
                className="mt-3 w-full py-1.5 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Show older'}
              </button>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
