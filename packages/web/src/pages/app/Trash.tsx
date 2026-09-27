import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IconButton } from '@/components/ui/IconButton';
import { useTrash, type TrashedTask } from '@/queries/trash';
import { useTaskActions } from '@/queries/taskActions';
import { formatUserDate } from '@/utils/dateFormat';

/** Deleted tasks, kept for 30 days: restore them or delete them for good. */
export default function Trash() {
  const { tasks, loading, error } = useTrash();
  const { restoreTask, purgeTask } = useTaskActions();
  const [purging, setPurging] = useState<TrashedTask | null>(null);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Trash</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Deleted tasks stay here for 30 days, then they're deleted for good. Subtasks come back with their task.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16">
          <Trash2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" aria-hidden="true" />
          <p className="text-gray-500 dark:text-gray-400">The trash is empty.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-white truncate">{task.content}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: task.project.color }} aria-hidden="true" />
                  {task.project.name}
                  <span aria-hidden="true">·</span>
                  Deleted {formatDistanceToNow(new Date(task.deletedAt), { addSuffix: true })}
                  <span aria-hidden="true">·</span>
                  Gone for good on {formatUserDate(new Date(task.purgeAt))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void restoreTask(task.id)}
                aria-label={`Restore ${task.content}`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                Restore
              </button>
              <IconButton label={`Delete ${task.content} forever`} tone="danger" onClick={() => setPurging(task)}>
                <Trash2 className="w-4 h-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={purging !== null}
        title="Delete forever?"
        message={`"${purging?.content ?? ''}" and its subtasks, comments and attachments will be deleted. This can't be undone.`}
        confirmLabel="Delete forever"
        onConfirm={() => {
          if (purging) void purgeTask(purging.id);
          setPurging(null);
        }}
        onCancel={() => setPurging(null)}
      />
    </div>
  );
}
