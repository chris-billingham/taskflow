import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router';
import { Spinner } from '@/components/ui/Spinner';
import { useTaskDetail } from '@/queries/tasks';
import { toastError } from '@/stores/toastStore';

/**
 * /tasks/:id — a stable link to a task. Opens it over its project, where it
 * belongs, with the task panel showing.
 */
export default function TaskLink() {
  const { id } = useParams<{ id: string }>();
  const { data: task, error, isPlaceholderData } = useTaskDetail(id);

  useEffect(() => {
    if (error) toastError('That task no longer exists or you no longer have access');
  }, [error]);

  if (error) return <Navigate to="/today" replace />;
  if (task && !isPlaceholderData) {
    return <Navigate to={`/projects/${task.projectId}?task=${task.id}`} replace />;
  }
  return (
    <div className="flex items-center justify-center py-20">
      <Spinner size="lg" />
    </div>
  );
}
