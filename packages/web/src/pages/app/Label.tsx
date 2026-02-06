import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Pencil, Star } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { TaskList } from '@/components/task/TaskList';
import { TaskDetail } from '@/components/task/TaskDetail';
import { useLabelStore } from '@/stores/labelStore';
import { useFilterStore } from '@/stores/filterStore';
import { useTaskStore } from '@/stores/taskStore';
import { useTaskActions } from '@/hooks/useTasks';
import type { Task } from '@/stores/taskStore';

export default function Label() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const label = useLabelStore((s) => (id ? s.labels.get(id) : undefined));
  const fetchLabels = useLabelStore((s) => s.fetchLabels);
  const updateLabel = useLabelStore((s) => s.updateLabel);
  const executeFilter = useFilterStore((s) => s.executeFilter);

  const taskMap = useTaskStore((s) => s.tasks);
  const { updateTask, deleteTask, completeTask, uncompleteTask, duplicateTask, reorderTasks } = useTaskActions();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');

  const fetchTasks = useCallback(async () => {
    if (!label) return;
    setLoading(true);
    try {
      const results = await executeFilter(`@${label.name}`);
      setTasks(results);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [label, executeFilter]);

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
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Label not found</h2>
        <p className="text-gray-600 mb-4">
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
              className="text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-[#db4c3f] focus:outline-none"
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
              className="text-sm text-gray-500 hover:underline"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{label?.name}</h1>
            <button
              className="p-1 rounded hover:bg-gray-100"
              onClick={handleStartEdit}
            >
              <Pencil className="w-4 h-4 text-gray-400" />
            </button>
            {label && (
              <button
                className="p-1 rounded hover:bg-gray-100"
                onClick={() => updateLabel(label.id, { isFavorite: !label.isFavorite })}
              >
                {label.isFavorite ? (
                  <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                ) : (
                  <Star className="w-4 h-4 text-gray-400" />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tasks */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : (
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
          onAddSubtask={async () => {}}
          subtasks={selectedTaskSubtasks}
        />
      )}
    </div>
  );
}
