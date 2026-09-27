import { useEffect } from 'react';
import { TaskDetail } from './TaskDetail';
import { useTaskPanel } from '@/hooks/useTaskPanel';
import { useTaskDetail } from '@/queries/tasks';
import { useTaskActions } from '@/queries/taskActions';
import { toastError } from '@/stores/toastStore';
import type { Task } from '@/types/task';

/**
 * The one task panel, mounted by the app layout and driven by `?task=` in the
 * URL. Every list, board and calendar opens tasks through useTaskPanel.
 */
export function TaskPanel() {
  const { openTaskId, openTask, closeTask } = useTaskPanel();
  if (!openTaskId) return null;
  return (
    <TaskPanelBody key={openTaskId} taskId={openTaskId} onClose={closeTask} onOpenTask={openTask} />
  );
}

function TaskPanelBody({
  taskId,
  onClose,
  onOpenTask,
}: {
  taskId: string;
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const { data: task, error } = useTaskDetail(taskId);
  const actions = useTaskActions();

  useEffect(() => {
    if (!error) return;
    toastError('That task no longer exists or you no longer have access');
    onClose();
    // Close once per failure, not on every render with a new onClose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  if (!task) return null;

  return (
    <TaskDetail
      task={task}
      subtasks={(task.subtasks as Task[] | undefined) ?? []}
      onClose={onClose}
      onUpdate={(id, data) => void actions.updateTask(id, data)}
      onComplete={(id) => void actions.completeTask(id)}
      onUncomplete={(id) => void actions.uncompleteTask(id)}
      onDelete={(id) => void actions.deleteTask(id)}
      onAddSubtask={async (text) => {
        await actions.createTask({ content: text, projectId: task.projectId, parentId: task.id });
      }}
      onOpenSubtask={onOpenTask}
    />
  );
}
