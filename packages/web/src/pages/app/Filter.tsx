import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Pencil, Star } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { TaskList } from '@/components/task/TaskList';
import { CalendarView } from '@/components/views/CalendarView';
import { ViewModeToggle, type ViewMode } from '@/components/views/ViewModeToggle';
import { BoardGroupingMenu, GroupedBoard, useBoardGrouping } from '@/components/views/GroupedBoard';
import type { BoardGrouping } from '@/stores/uiStore';

const FILTER_GROUPINGS: BoardGrouping[] = ['priority', 'dueDate', 'assignee', 'project'];
import { useFilters, useFilterActions } from '@/queries/filters';
import { useFilterTasks } from '@/queries/tasks';

export default function Filter() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { filters, loading: filtersLoading } = useFilters();
  const filter = filters.find((f) => f.id === id);
  const { updateFilter } = useFilterActions();

  const { tasks, loading, hasMore, loadingMore, loadMore } = useFilterTasks(filter ? filter.query : null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');

  // Filter.viewStyle is a persisted column (and was already accepted by the
  // API) but the page kept its own local state, so the saved choice was never
  // loaded and never written back. Read it from the filter and persist changes.
  const viewMode: ViewMode =
    filter?.viewStyle === 'CALENDAR' ? 'calendar' : filter?.viewStyle === 'BOARD' ? 'board' : 'list';

  const setViewMode = (mode: ViewMode) => {
    if (!filter) return;
    void updateFilter(filter.id, {
      viewStyle: mode === 'calendar' ? 'CALENDAR' : mode === 'board' ? 'BOARD' : 'LIST',
    });
  };
  const [grouping, setGrouping] = useBoardGrouping(`filter:${id}`, 'priority');


  if (!filter && !filtersLoading) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Filter not found</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          This filter may have been deleted.
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

  const handleSaveEdit = async () => {
    if (!filter || !editName.trim()) return;
    await updateFilter(filter.id, { name: editName.trim() });
    setEditing(false);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        {filter && (
          <span
            className="w-4 h-4 rounded-sm shrink-0"
            style={{ backgroundColor: filter.color }}
          />
        )}
        {editing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              className="text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-primary-500 focus:outline-hidden"
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{filter?.name}</h1>
            <button
              className="p-1 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => {
                if (filter) {
                  setEditName(filter.name);
                  setEditing(true);
                }
              }}
            >
              <Pencil className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            </button>
            {filter && (
              <button
                className="p-1 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => updateFilter(filter.id, { isFavorite: !filter.isFavorite })}
              >
                {filter.isFavorite ? (
                  <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                ) : (
                  <Star className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                )}
              </button>
            )}
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
        )}
      </div>

      {/* Query display */}
      {filter && (
        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mb-6">Query: {filter.query}</p>
      )}

      {/* Tasks */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : viewMode === 'calendar' ? (
        <CalendarView tasks={tasks.filter((t) => !t.parentId)} />
      ) : (
        <>
          {viewMode === 'board' ? (
            <>
              <div className="flex justify-end -mb-2">
                <BoardGroupingMenu value={grouping} options={FILTER_GROUPINGS} onChange={setGrouping} />
              </div>
              <GroupedBoard tasks={tasks} grouping={grouping as Exclude<BoardGrouping, 'section'>} />
            </>
          ) : (
            <TaskList tasks={tasks} emptyMessage="No tasks match this filter" />
          )}

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
