import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { ViewHeader } from '@/components/views/ViewHeader';
import { OverdueSection } from '@/components/views/OverdueSection';
import { DateSection } from '@/components/views/DateSection';
import { QuickAdd } from '@/components/task/QuickAdd';
import { TaskDetail } from '@/components/task/TaskDetail';
import { TaskItem } from '@/components/task/TaskItem';
import { Spinner } from '@/components/ui/Spinner';
import { useTodayView, useTaskActions } from '@/hooks/useTasks';
import { useTaskStore } from '@/stores/taskStore';
import type { Task } from '@/stores/taskStore';

export default function Today() {
  const { todayView, loading, refetch, rescheduleOverdue } = useTodayView();
  const taskMap = useTaskStore((s) => s.tasks);
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

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const formattedDate = format(new Date(), 'EEEE, MMMM d');

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

  const handleRescheduleAll = async () => {
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

  if (loading && !todayView) {
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

  const totalCount =
    todayView?.counts.total ?? 0;

  const isEmpty =
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

      {todayView && !isEmpty && hasTimedTasks && (
        <>
          {todayView.morning.length > 0 && (
            <TimeSection
              label="Morning"
              tasks={todayView.morning}
              allTasks={taskMap}
              onComplete={handleComplete}
              onUncomplete={handleUncomplete}
              onTaskClick={setSelectedTask}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
              onDuplicate={handleDuplicate}
            />
          )}
          {todayView.afternoon.length > 0 && (
            <TimeSection
              label="Afternoon"
              tasks={todayView.afternoon}
              allTasks={taskMap}
              onComplete={handleComplete}
              onUncomplete={handleUncomplete}
              onTaskClick={setSelectedTask}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
              onDuplicate={handleDuplicate}
            />
          )}
          {todayView.evening.length > 0 && (
            <TimeSection
              label="Evening"
              tasks={todayView.evening}
              allTasks={taskMap}
              onComplete={handleComplete}
              onUncomplete={handleUncomplete}
              onTaskClick={setSelectedTask}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
              onDuplicate={handleDuplicate}
            />
          )}
          {todayView.noTime.length > 0 && (
            <TimeSection
              label="No time"
              tasks={todayView.noTime}
              allTasks={taskMap}
              onComplete={handleComplete}
              onUncomplete={handleUncomplete}
              onTaskClick={setSelectedTask}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
              onDuplicate={handleDuplicate}
            />
          )}
        </>
      )}

      {todayView && !isEmpty && !hasTimedTasks && (
        <DateSection
          date={todayStr}
          tasks={allTodayTasks}
          allTasks={taskMap}
          onComplete={handleComplete}
          onUncomplete={handleUncomplete}
          onTaskClick={setSelectedTask}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
          onDuplicate={handleDuplicate}
          onReorder={handleReorder}
          onAddTask={handleQuickAdd}
        />
      )}

      {isEmpty && (
        <div className="text-center py-16">
          <CalendarDays className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-500 mb-1">
            All clear for today
          </h3>
          <p className="text-sm text-gray-400">
            Enjoy your day or add a new task below.
          </p>
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
    </div>
  );
}

function TimeSection({
  label,
  tasks,
  allTasks,
  onComplete,
  onUncomplete,
  onTaskClick,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  label: string;
  tasks: Task[];
  allTasks: Map<string, Task>;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onTaskClick: (task: Task) => void;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 py-2 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-0.5">
        {tasks.map((task) => {
          const subtasks = Array.from(allTasks.values())
            .filter((t) => t.parentId === task.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          return (
            <TaskItem
              key={task.id}
              task={task}
              onComplete={onComplete}
              onUncomplete={onUncomplete}
              onClick={onTaskClick}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              showSubtasks
              subtasks={subtasks}
            />
          );
        })}
      </div>
    </div>
  );
}
