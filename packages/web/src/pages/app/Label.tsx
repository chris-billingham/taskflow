import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Pencil, Star, Calendar, List } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { TaskList } from '@/components/task/TaskList';
import { CalendarView } from '@/components/views/CalendarView';
import { useLabels, useLabelActions } from '@/queries/labels';
import { useFilterTasks } from '@/queries/tasks';

export default function Label() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { labels, loading: labelsLoading } = useLabels();
  const label = labels.find((l) => l.id === id);
  const { updateLabel } = useLabelActions();

  const { tasks, loading, hasMore, loadingMore, loadMore } = useFilterTasks(label ? `@${label.name}` : null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');


  if (!label && !labelsLoading) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Label not found</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          This label may have been deleted.
        </p>
        <button
          className="text-primary-500 hover:underline"
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
  };

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
              className="text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-primary-500 focus:outline-none"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
              autoFocus
            />
            <button
              className="text-sm text-primary-500 hover:underline"
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
        <CalendarView tasks={tasks.filter((t) => !t.parentId)} />
      ) : (
        <>
          <TaskList tasks={tasks} emptyMessage="No tasks with this label" />

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

        </>
      )}
    </div>
  );
}
