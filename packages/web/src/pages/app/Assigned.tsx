import { useState } from 'react';
import { UserCheck } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { TaskList } from '@/components/task/TaskList';
import { ViewModeToggle, type ViewMode } from '@/components/views/ViewModeToggle';
import { BoardGroupingMenu, GroupedBoard, useBoardGrouping } from '@/components/views/GroupedBoard';
import { useFilterTasks } from '@/queries/tasks';
import type { BoardGrouping } from '@/stores/uiStore';
import { useWideLayout } from '@/hooks/useWideLayout';

const GROUPINGS: BoardGrouping[] = ['project', 'dueDate', 'priority'];

/** Open tasks assigned to you, in every project you can see. */
export default function Assigned() {
  const { tasks, loading, hasMore, loadingMore, loadMore } = useFilterTasks('assigned to: me & !completed');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  useWideLayout(viewMode !== 'list');
  const [grouping, setGrouping] = useBoardGrouping('assigned', 'project');

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <UserCheck className="w-6 h-6 text-primary-500" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Assigned to me</h1>
        <ViewModeToggle value={viewMode} modes={['list', 'board']} onChange={setViewMode} />
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : viewMode === 'board' ? (
        <>
          <div className="flex justify-end -mb-2">
            <BoardGroupingMenu value={grouping} options={GROUPINGS} onChange={setGrouping} />
          </div>
          <GroupedBoard tasks={tasks} grouping={grouping as Exclude<BoardGrouping, 'section'>} />
        </>
      ) : (
        <TaskList tasks={tasks} emptyMessage="Nothing is assigned to you right now." />
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
    </div>
  );
}
