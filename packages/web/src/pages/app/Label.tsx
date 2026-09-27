import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Pencil, Star, Calendar, List } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { TaskList } from '@/components/task/TaskList';
import { TaskDetail } from '@/components/task/TaskDetail';
import { CalendarView } from '@/components/views/CalendarView';
import { useLabelStore } from '@/stores/labelStore';
import { useTaskStore } from '@/stores/taskStore';
import { useTaskActions } from '@/hooks/useTasks';
import { useFilterResults } from '@/hooks/useFilterResults';
import type { Task, QuickAddDue } from '@/stores/taskStore';

export default function Label() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const label = useLabelStore((s) => (id ? s.labels.get(id) : undefined));
  const fetchLabels = useLabelStore((s) => s.fetchLabels);
  const updateLabel = useLabelStore((s) => s.updateLabel);

  const taskMap = useTaskStore((s) => s.tasks);
  const {
    createTask,
    updateTask,
    deleteTask,
    completeTask,
    uncompleteTask,
    duplicateTask,
    reorderTasks,
    quickAddTask,
  } = useTaskActions();

  const {
    tasks,
    loading,
    hasMore,
    loadingMore,
    loadMore,
    refetch: fetchTasks,
  } = useFilterResults(label ? `@${label.name}` : null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  useEffect(() => {
    if (label) {
      fetchTasks();
    }
  }, [label, fetchTasks]);

  if (!label && !loading) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Label not found</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          This label may have been deleted.
        </p>
        <button
          className="text-[#db4c3f] hover:underline"
          onClick={() => navigate('/filters-labels')}
        >
          Go to Filters & Labels
        </button>
      </div>
    );
  }

  const handleStartEdit = () => {
    if (!label) return;
    setEditName(label.name);
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!label || !editName.trim()) return;
    await updateLabel(label.id, { name: editName.trim() });
    setEditing(false);
    fetchTasks();
  };

  const handleComplete = async (taskId: string) => {
    await completeTask(taskId);
    fetchTasks();
  };

  const handleUncomplete = async (taskId: string) => {
    await uncompleteTask(taskId);
    fetchTasks();
  };

  const handleDeleteTask = async (taskId: string) => {
    await deleteTask(taskId);
    if (selectedTask?.id === taskId) setSelectedTask(null);
    fetchTasks();
  };

  const handleDuplicate = async (taskId: string) => {
    await duplicateTask(taskId);
    fetchTasks();
  };

  const handleAddSubtask = async (text: string) => {
    if (!selectedTask) return;
    await createTask({
      content: text,
      projectId: selectedTask.projectId,
      parentId: selectedTask.id,
    });
    fetchTasks();
  };

  // Tag the new task with this label so it lands in the view the user is
  // looking at, rather than being created and immediately filtered out.
  const handleQuickAdd = async (text: string, due?: QuickAddDue) => {
    if (!label) return;
    await quickAddTask(`${text} @${label.name}`, undefined, due);
    fetchTasks();
  };

  const selectedTaskSubtasks = selectedTask
    ? Array.from(taskMap.values())
        .filter((t) => t.parentId === selectedTask.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  const currentSelectedTask = selectedTask
    ? taskMap.get(selectedTask.id) || selectedTask
    : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {label && (
          <span
            className="w-4 h-4 rounded-full flex-shrink-0"
            style={{ backgroundColor: label.color }}
          />
        )}
        {editing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              className="text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-[#db4c3f] focus:outline-none"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
              autoFocus
            />
            <button
              className="text-sm text-[#db4c3f] hover:underline"
              onClick={handleSaveEdit}
            >
              Save
            </button>
            <button
              className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{label?.name}</h1>
            <button
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={handleStartEdit}
            >
              <Pencil className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            </button>
            {label && (
              <button
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => updateLabel(label.id, { isFavorite: !label.isFavorite })}
              >
                {label.isFavorite ? (
                  <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                ) : (
                  <Star className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                )}
              </button>
            )}
            <div className="flex items-center gap-0.5 ml-2">
              <button
                className={`p-1 rounded transition-colors ${
                  viewMode === 'list'
                    ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                onClick={() => setViewMode('list')}
                title="List view"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                className={`p-1 rounded transition-colors ${
                  viewMode === 'calendar'
                    ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                onClick={() => setViewMode('calendar')}
                title="Calendar view"
              >
                <Calendar className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tasks */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : viewMode === 'calendar' ? (
        <CalendarView
          tasks={tasks.filter((t) => !t.parentId)}
          allTasks={taskMap}
          onUpdateTask={async (id, data) => {
            await updateTask(id, data);
            fetchTasks();
          }}
          onCompleteTask={handleComplete}
          onUncompleteTask={handleUncomplete}
          onDeleteTask={handleDeleteTask}
          onAddSubtask={handleAddSubtask}
          onQuickAdd={handleQuickAdd}
        />
      ) : (
        <>
          <TaskList
            tasks={tasks}
            allTasks={taskMap}
            onComplete={handleComplete}
            onUncomplete={handleUncomplete}
            onTaskClick={setSelectedTask}
            onUpdate={async (id, data) => {
              await updateTask(id, data);
              fetchTasks();
            }}
            onDelete={handleDeleteTask}
            onDuplicate={handleDuplicate}
            onReorder={reorderTasks}
            emptyMessage="No tasks with this label"
          />

          {hasMore && (
            <div className="flex justify-center py-3">
              <button
                className="px-4 py-1.5 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                onClick={() => loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Load more tasks'}
              </button>
            </div>
          )}

          {/* Task detail panel */}
          {currentSelectedTask && (
            <TaskDetail
              task={currentSelectedTask}
              onClose={() => setSelectedTask(null)}
              onUpdate={async (id: string, data: Record<string, any>) => {
                await updateTask(id, data);
                fetchTasks();
              }}
              onComplete={handleComplete}
              onUncomplete={handleUncomplete}
              onDelete={handleDeleteTask}
              onAddSubtask={handleAddSubtask}
              subtasks={selectedTaskSubtasks}
            />
          )}
        </>
      )}
    </div>
  );
}
