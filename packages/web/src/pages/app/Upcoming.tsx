import { useState, useMemo, useCallback } from 'react';
import { format, addDays, startOfDay } from 'date-fns';
import { CalendarRange, ChevronDown, Calendar, List } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
} from '@dnd-kit/core';
import { ViewHeader } from '@/components/views/ViewHeader';
import { CalendarView } from '@/components/views/CalendarView';
import { OverdueSection } from '@/components/views/OverdueSection';
import { DateSection } from '@/components/views/DateSection';
import { CalendarStrip } from '@/components/views/CalendarStrip';
import { TruncationNotice } from '@/components/views/TruncationNotice';
import { QuickAdd } from '@/components/task/QuickAdd';
import { TaskItem } from '@/components/task/TaskItem';
import { Spinner } from '@/components/ui/Spinner';
import { useUpcomingView } from '@/queries/tasks';
import { useTaskActions } from '@/queries/taskActions';
import type { Task } from '@/types/task';

const UPCOMING_DAYS = 14;

export default function Upcoming() {
  const { upcomingView: upcomingViewRaw, loading, error, refetch } = useUpcomingView(UPCOMING_DAYS, true);
  const { updateTask, quickAddTask, rescheduleOverdue } = useTaskActions();

  // Completed tasks leave the view at once (see Today.tsx).
  const upcomingView = useMemo(() => {
    if (!upcomingViewRaw) return null;
    const open = (list: Task[]) => list.filter((t) => !t.isCompleted);
    const byDate: Record<string, Task[]> = {};
    for (const [date, tasks] of Object.entries(upcomingViewRaw.byDate)) {
      byDate[date] = open(tasks as Task[]);
    }
    return {
      ...upcomingViewRaw,
      overdue: open(upcomingViewRaw.overdue as Task[]),
      byDate,
      noDate: open(upcomingViewRaw.noDate as Task[]),
    };
  }, [upcomingViewRaw]);

  const [noDateCollapsed, setNoDateCollapsed] = useState(false);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Generate date keys for the upcoming range
  const dateKeys = useMemo(() => {
    const keys: string[] = [];
    const start = startOfDay(new Date());
    for (let i = 0; i < UPCOMING_DAYS; i++) {
      keys.push(format(addDays(start, i), 'yyyy-MM-dd'));
    }
    return keys;
  }, []);

  const taskCountByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!upcomingView) return counts;
    for (const [date, tasks] of Object.entries(upcomingView.byDate)) {
      counts[date] = tasks.length;
    }
    return counts;
  }, [upcomingView]);

  const handleDateClick = (date: string) => {
    const el = document.getElementById(`date-section-${date}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleQuickAddForDate = useCallback(
    (date: string) => async (text: string) => {
      // The section's date, sent exactly: as "MMM d" text, today's section
      // parsed as a year from now.
      await quickAddTask(text, undefined, { dueDate: date });
    },
    [quickAddTask],
  );

  const handleRescheduleAll = async () => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    await rescheduleOverdue(todayStr);
  };

  const handleQuickAdd = async (text: string) => {
    await quickAddTask(text);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (over && typeof over.id === 'string' && over.id.startsWith('droppable-')) {
      setDragOverDate(over.id.replace('droppable-', ''));
    } else {
      setDragOverDate(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setDragOverDate(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const droppableId = over.id as string;
    if (!droppableId.startsWith('droppable-')) return;

    const newDate = droppableId.replace('droppable-', '');
    const task = allUpcomingTasks.find((t) => t.id === taskId);
    if (!task) return;

    const currentDate = task.dueDate ? task.dueDate.split('T')[0] : null;
    if (currentDate === newDate) return;

    await updateTask(taskId, { dueDate: newDate });
  };

  // Flatten all upcoming tasks for calendar view (must be before early return to satisfy rules of hooks)
  const allUpcomingTasks = useMemo(() => {
    if (!upcomingView) return [];
    return [
      ...upcomingView.overdue,
      ...Object.values(upcomingView.byDate).flat(),
      ...upcomingView.noDate,
    ];
  }, [upcomingView]);

  if (loading && !upcomingView) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  const totalCount = upcomingView?.counts.total ?? 0;
  const isEmpty =
    !error &&
    totalCount === 0 &&
    (upcomingView?.counts.overdue ?? 0) === 0;

  return (
    <div>
      <ViewHeader title="Upcoming" taskCount={totalCount}>
        <button
          className={`p-1.5 rounded transition-colors ${
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
          className={`p-1.5 rounded transition-colors ${
            viewMode === 'calendar'
              ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white'
              : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          onClick={() => setViewMode('calendar')}
          title="Calendar view"
        >
          <Calendar className="w-4 h-4" />
        </button>
      </ViewHeader>

      {viewMode === 'calendar' ? (
        <CalendarView tasks={allUpcomingTasks.filter((t) => !t.parentId)} />
      ) : (
        <>
          <CalendarStrip
            days={UPCOMING_DAYS}
            taskCountByDate={taskCountByDate}
            onDateClick={handleDateClick}
          />

          {upcomingView && upcomingView.overdue.length > 0 && (
            <OverdueSection
              tasks={upcomingView.overdue}
              onRescheduleAll={handleRescheduleAll}
            />
          )}

          {error && !loading && (
            <div className="text-center py-16">
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">
                Couldn't load Upcoming
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{error}</p>
              <button
                className="px-4 py-1.5 text-sm text-white bg-[#db4c3f] rounded-lg hover:bg-[#c53727]"
                onClick={() => refetch()}
              >
                Try again
              </button>
            </div>
          )}

          {isEmpty && (
            <div className="text-center py-16">
              <CalendarRange className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-1">
                Nothing upcoming
              </h3>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Add tasks with due dates to see them here.
              </p>
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {dateKeys.map((date) => {
              const tasks = upcomingView?.byDate[date] || [];
              return (
                <DroppableDateSection
                  key={date}
                  date={date}
                  tasks={tasks}
                  isOver={dragOverDate === date}
                  onAddTask={handleQuickAddForDate(date)}
                />
              );
            })}
          </DndContext>

          {upcomingView && upcomingView.noDate.length > 0 && (
            <div className="mb-4">
              <button
                className="flex items-center gap-2 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 w-full"
                onClick={() => setNoDateCollapsed(!noDateCollapsed)}
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${noDateCollapsed ? '-rotate-90' : ''}`}
                />
                No date
                <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                  {upcomingView.noDate.length}
                </span>
              </button>
              {!noDateCollapsed && (
                <div className="space-y-0.5">
                  {upcomingView.noDate.map((task) => (
                    <TaskItem key={task.id} task={task} showSubtasks />
                  ))}
                </div>
              )}
            </div>
          )}

          {upcomingView && (
            <TruncationNotice
              returned={upcomingView.counts.returned}
              total={upcomingView.counts.total}
            />
          )}

          <div className="mt-4">
            <QuickAdd onSubmit={handleQuickAdd} placeholder="Add task" />
          </div>

        </>
      )}
    </div>
  );
}

function DroppableDateSection({
  date,
  tasks,
  isOver,
  onAddTask,
}: {
  date: string;
  tasks: Task[];
  isOver: boolean;
  onAddTask: (text: string) => Promise<void>;
}) {
  const { setNodeRef } = useDroppable({ id: `droppable-${date}` });

  return (
    <div
      ref={setNodeRef}
      className={`transition-colors rounded-lg ${
        isOver ? 'ring-2 ring-[#db4c3f] ring-opacity-50 bg-red-50/30' : ''
      }`}
    >
      <DateSection date={date} tasks={tasks} onAddTask={onAddTask} externalDnd />
    </div>
  );
}
