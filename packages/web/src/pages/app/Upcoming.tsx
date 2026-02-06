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
import { QuickAdd } from '@/components/task/QuickAdd';
import { TaskDetail } from '@/components/task/TaskDetail';
import { TaskItem } from '@/components/task/TaskItem';
import { Spinner } from '@/components/ui/Spinner';
import { useUpcomingView, useTaskActions } from '@/hooks/useTasks';
import { useTaskStore } from '@/stores/taskStore';
import type { Task } from '@/stores/taskStore';

const UPCOMING_DAYS = 14;

export default function Upcoming() {
  const { upcomingView, loading, refetch } = useUpcomingView(UPCOMING_DAYS, true);
  const taskMap = useTaskStore((s) => s.tasks);
  const rescheduleOverdue = useTaskStore((s) => s.rescheduleOverdue);
  const {
    createTask,
    updateTask,
    deleteTask,
    completeTask,
    uncompleteTask,
    duplicateTask: duplicateTaskAction,
    quickAddTask,
    reorderTasks,
  } = useTaskActions();

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
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

  const handleComplete = async (taskId: string) => {
    await completeTask(taskId);
    refetch();
  };

  const handleUncomplete = async (taskId: string) => {
    await uncompleteTask(taskId);
    refetch();
  };

  const handleUpdateTask = async (taskId: string, data: Record<string, any>) => {
    await updateTask(taskId, data);
    refetch();
  };

  const handleDeleteTask = async (taskId: string) => {
    await deleteTask(taskId);
    if (selectedTask?.id === taskId) setSelectedTask(null);
    refetch();
  };

  const handleDuplicate = async (taskId: string) => {
    await duplicateTaskAction(taskId);
    refetch();
  };

  const handleReorder = async (taskIds: string[]) => {
    await reorderTasks(taskIds);
  };

  const handleQuickAdd = async (text: string) => {
    await quickAddTask(text);
    refetch();
  };

  const handleQuickAddForDate = useCallback(
    (date: string) => async (text: string) => {
      await quickAddTask(`${text} ${format(new Date(date + 'T12:00:00'), 'MMM d')}`);
      refetch();
    },
    [quickAddTask, refetch],
  );

  const handleRescheduleAll = async () => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    await rescheduleOverdue(todayStr);
    refetch();
  };

  const handleAddSubtask = async (text: string) => {
    if (!selectedTask) return;
    await createTask({
      content: text,
      projectId: selectedTask.projectId,
      parentId: selectedTask.id,
    });
    refetch();
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
    const task = taskMap.get(taskId);
    if (!task) return;

    const currentDate = task.dueDate ? task.dueDate.split('T')[0] : null;
    if (currentDate === newDate) return;

    await updateTask(taskId, { dueDate: newDate });
    refetch();
  };

  if (loading && !upcomingView) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  const selectedTaskSubtasks = selectedTask
    ? Array.from(taskMap.values())
        .filter((t) => t.parentId === selectedTask.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  const currentSelectedTask = selectedTask
    ? taskMap.get(selectedTask.id) || selectedTask
    : null;

  const totalCount = upcomingView?.counts.total ?? 0;
  const isEmpty =
    totalCount === 0 &&
    (upcomingView?.counts.overdue ?? 0) === 0;

  // Flatten all upcoming tasks for calendar view
  const allUpcomingTasks = useMemo(() => {
    if (!upcomingView) return [];
    return [
      ...upcomingView.overdue,
      ...Object.values(upcomingView.byDate).flat(),
      ...upcomingView.noDate,
    ];
  }, [upcomingView]);

  return (
    <div>
      <ViewHeader title="Upcoming" taskCount={totalCount}>
        <button
          className={`p-1.5 rounded transition-colors ${
            viewMode === 'list'
              ? 'bg-gray-200 text-gray-900'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
          }`}
          onClick={() => setViewMode('list')}
          title="List view"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          className={`p-1.5 rounded transition-colors ${
            viewMode === 'calendar'
              ? 'bg-gray-200 text-gray-900'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
          }`}
          onClick={() => setViewMode('calendar')}
          title="Calendar view"
        >
          <Calendar className="w-4 h-4" />
        </button>
      </ViewHeader>

      {viewMode === 'calendar' ? (
        <CalendarView
          tasks={allUpcomingTasks.filter((t) => !t.parentId)}
          allTasks={taskMap}
          onUpdateTask={handleUpdateTask}
          onCompleteTask={handleComplete}
          onUncompleteTask={handleUncomplete}
          onDeleteTask={handleDeleteTask}
          onAddSubtask={handleAddSubtask}
          onQuickAdd={handleQuickAdd}
        />
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
              allTasks={taskMap}
              onComplete={handleComplete}
              onUncomplete={handleUncomplete}
              onTaskClick={setSelectedTask}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
              onDuplicate={handleDuplicate}
              onRescheduleAll={handleRescheduleAll}
            />
          )}

          {isEmpty && (
            <div className="text-center py-16">
              <CalendarRange className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-500 mb-1">
                Nothing upcoming
              </h3>
              <p className="text-sm text-gray-400">
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
                  allTasks={taskMap}
                  isOver={dragOverDate === date}
                  onComplete={handleComplete}
                  onUncomplete={handleUncomplete}
                  onTaskClick={setSelectedTask}
                  onUpdate={handleUpdateTask}
                  onDelete={handleDeleteTask}
                  onDuplicate={handleDuplicate}
                  onReorder={handleReorder}
                  onAddTask={handleQuickAddForDate(date)}
                />
              );
            })}
          </DndContext>

          {upcomingView && upcomingView.noDate.length > 0 && (
            <div className="mb-4">
              <button
                className="flex items-center gap-2 py-2 text-sm font-semibold text-gray-700 border-b border-gray-200 w-full"
                onClick={() => setNoDateCollapsed(!noDateCollapsed)}
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${noDateCollapsed ? '-rotate-90' : ''}`}
                />
                No date
                <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                  {upcomingView.noDate.length}
                </span>
              </button>
              {!noDateCollapsed && (
                <div className="space-y-0.5">
                  {upcomingView.noDate.map((task) => {
                    const subtasks = Array.from(taskMap.values())
                      .filter((t) => t.parentId === task.id)
                      .sort((a, b) => a.sortOrder - b.sortOrder);
                    return (
                      <TaskItem
                        key={task.id}
                        task={task}
                        onComplete={handleComplete}
                        onUncomplete={handleUncomplete}
                        onClick={setSelectedTask}
                        onUpdate={handleUpdateTask}
                        onDelete={handleDeleteTask}
                        onDuplicate={handleDuplicate}
                        showSubtasks
                        subtasks={subtasks}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="mt-4">
            <QuickAdd onSubmit={handleQuickAdd} placeholder="Add task" />
          </div>

          {currentSelectedTask && (
            <TaskDetail
              task={currentSelectedTask}
              onClose={() => setSelectedTask(null)}
              onUpdate={handleUpdateTask}
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

function DroppableDateSection({
  date,
  tasks,
  allTasks,
  isOver,
  onComplete,
  onUncomplete,
  onTaskClick,
  onUpdate,
  onDelete,
  onDuplicate,
  onReorder,
  onAddTask,
}: {
  date: string;
  tasks: Task[];
  allTasks: Map<string, Task>;
  isOver: boolean;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onTaskClick: (task: Task) => void;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (taskIds: string[]) => void;
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
      <DateSection
        date={date}
        tasks={tasks}
        allTasks={allTasks}
        onComplete={onComplete}
        onUncomplete={onUncomplete}
        onTaskClick={onTaskClick}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onReorder={onReorder}
        onAddTask={onAddTask}
        externalDnd
      />
    </div>
  );
}
