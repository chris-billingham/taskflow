import { Activity, Loader2, AlertCircle } from 'lucide-react';
import { useTaskActivity } from '@/hooks/useActivity';
import { useCommentStore } from '@/stores/commentStore';
import { ActivityItemComponent } from './ActivityItem';

interface ActivityLogProps {
  taskId: string;
  taskUpdatedAt?: string;
}

export function ActivityLog({ taskId, taskUpdatedAt }: ActivityLogProps) {
  const commentVersion = useCommentStore((s) => s.version);
  const refreshKey = `${taskUpdatedAt ?? ''}-${commentVersion}`;
  const { activities, loading, error } = useTaskActivity(taskId, undefined, refreshKey);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
        <Activity className="w-4 h-4" />
        Activity
      </h3>

      {/* Loading state */}
      {loading && activities.length === 0 && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 py-3 text-xs text-red-500">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && activities.length === 0 && (
        <p className="text-xs text-gray-400 italic py-2">
          No activity yet.
        </p>
      )}

      {/* Activity list */}
      {activities.length > 0 && (
        <div className="divide-y divide-gray-100">
          {activities.map((activity) => (
            <ActivityItemComponent key={activity.id} activity={activity} />
          ))}
        </div>
      )}
    </div>
  );
}
