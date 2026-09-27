import { useMemo } from 'react';
import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { ViewHeader } from '@/components/views/ViewHeader';
import { OverdueSection } from '@/components/views/OverdueSection';
import { DateSection } from '@/components/views/DateSection';
import { TruncationNotice } from '@/components/views/TruncationNotice';
import { QuickAdd } from '@/components/task/QuickAdd';
import { TaskItem } from '@/components/task/TaskItem';
import { Spinner } from '@/components/ui/Spinner';
import { useTodayView } from '@/queries/tasks';
import { useTaskActions } from '@/queries/taskActions';
import type { Task, TodayViewData } from '@/types/task';
import { formatUserDateWithWeekday } from '@/utils/dateFormat';

export default function Today() {
  const { todayView: todayViewRaw, loading, error, refetch } = useTodayView();
  const { quickAddTask, rescheduleOverdue } = useTaskActions();

  // A task completed here leaves the view at once (the cache is patched
  // optimistically; the refetch that follows drops it for good).
  const todayView = useMemo(() => {
    if (!todayViewRaw) return null;
    const open = (list: TodayViewData['overdue']) =>
      (list as Task[]).filter((t) => !t.isCompleted);
    return {
      ...todayViewRaw,
      overdue: open(todayViewRaw.overdue),
      morning: open(todayViewRaw.morning),
      afternoon: open(todayViewRaw.afternoon),
      evening: open(todayViewRaw.evening),
      noTime: open(todayViewRaw.noTime),
    };
  }, [todayViewRaw]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const formattedDate = formatUserDateWithWeekday(new Date());

  const hasTimedTasks = useMemo(() => {
    if (!todayView) return false;
    return (
      todayView.morning.length > 0 ||
      todayView.afternoon.length > 0 ||
      todayView.evening.length > 0
    );
  }, [todayView]);

  const allTodayTasks = useMemo(() => {
    if (!todayView) return [];
    return [
      ...todayView.morning,
      ...todayView.afternoon,
      ...todayView.evening,
      ...todayView.noTime,
    ];
  }, [todayView]);

  const handleQuickAdd = async (text: string) => {
    await quickAddTask(text);
  };

  const handleRescheduleAll = async () => {
    await rescheduleOverdue(todayStr);
  };

  if (loading && !todayView) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  const totalCount =
    todayView?.counts.total ?? 0;

  const isEmpty =
    !error &&
    totalCount === 0 &&
    (todayView?.counts.overdue ?? 0) === 0;

  return (
    <div>
      <ViewHeader
        title="Today"
        subtitle={formattedDate}
        taskCount={totalCount}
      />

      {todayView && todayView.overdue.length > 0 && (
        <OverdueSection
          tasks={todayView.overdue}
          onRescheduleAll={handleRescheduleAll}
        />
      )}

      {todayView && !isEmpty && hasTimedTasks && (
        <>
          {todayView.morning.length > 0 && (
            <TimeSection
              label="Morning"
              tasks={todayView.morning}
            />
          )}
          {todayView.afternoon.length > 0 && (
            <TimeSection
              label="Afternoon"
              tasks={todayView.afternoon}
            />
          )}
          {todayView.evening.length > 0 && (
            <TimeSection
              label="Evening"
              tasks={todayView.evening}
            />
          )}
          {todayView.noTime.length > 0 && (
            <TimeSection
              label="No time"
              tasks={todayView.noTime}
            />
          )}
        </>
      )}

      {todayView && !isEmpty && !hasTimedTasks && (
        <DateSection
          date={todayStr}
          tasks={allTodayTasks}
          onAddTask={handleQuickAdd}
        />
      )}

      {error && !loading && (
        <div className="text-center py-16">
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">
            Couldn't load Today
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
          <CalendarDays className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-1">
            All clear for today
          </h3>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Enjoy your day or add a new task below.
          </p>
        </div>
      )}

      {todayView && (
        <TruncationNotice
          returned={todayView.counts.returned}
          total={todayView.counts.total}
        />
      )}

      {(isEmpty || hasTimedTasks) && (
        <div className="mt-4">
          <QuickAdd onSubmit={handleQuickAdd} placeholder="Add task" />
        </div>
      )}

    </div>
  );
}

function TimeSection({ label, tasks }: { label: string; tasks: Task[] }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 py-2 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</h3>
        <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-0.5">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} showSubtasks />
        ))}
      </div>
    </div>
  );
}
