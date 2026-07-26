import { useState, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core';
import { useCalendar } from '@/hooks/useCalendar';
import type { CalendarMode } from '@/hooks/useCalendar';
import { CalendarHeader } from '@/components/calendar/CalendarHeader';
import { WeekView } from '@/components/calendar/WeekView';
import { MonthView } from '@/components/calendar/MonthView';
import { TaskDetail } from '@/components/task/TaskDetail';
import { Modal } from '@/components/ui/Modal';
import { QuickAdd } from '@/components/task/QuickAdd';
import type { Task } from '@/stores/taskStore';
import { getSubtasks } from '@/utils/subtaskIndex';
import { formatUserDateWithWeekday } from '@/utils/dateFormat';

interface CalendarViewProps {
  tasks: Task[];
  allTasks: Map<string, Task>;
  onUpdateTask: (id: string, data: Record<string, any>) => Promise<void>;
  onCompleteTask: (id: string) => Promise<void>;
  onUncompleteTask: (id: string) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onAddSubtask: (text: string) => Promise<void>;
  onQuickAdd: (text: string) => Promise<void>;
  defaultProjectId?: string;
  initialMode?: CalendarMode;
}

export function CalendarView({
  tasks,
  allTasks,
  onUpdateTask,
  onCompleteTask,
  onUncompleteTask,
  onDeleteTask,
  onAddSubtask,
  onQuickAdd,
  defaultProjectId: _defaultProjectId,
  initialMode = 'week',
}: CalendarViewProps) {
  const calendar = useCalendar(tasks, initialMode);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [quickAddState, setQuickAddState] = useState<{
    isOpen: boolean;
    dateStr: string;
    time: string;
  }>({ isOpen: false, dateStr: '', time: '' });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const taskId = active.id as string;
      const droppableId = over.id as string;

      if (droppableId.startsWith('day-')) {
        // Dropped on a day cell (month view or anytime row)
        const targetDate = droppableId.replace('day-', '');
        const task = allTasks.get(taskId);
        if (!task) return;
        const currentDate = task.dueDate?.split('T')[0] ?? null;
        if (currentDate === targetDate) return;
        await onUpdateTask(taskId, { dueDate: targetDate });
      } else if (droppableId.startsWith('slot-')) {
        // Dropped on a time slot: slot-YYYY-MM-DD-HH:00
        const parts = droppableId.replace('slot-', '');
        const dateStr = parts.slice(0, 10);
        const timeStr = parts.slice(11); // HH:00
        // Snap to 15-min intervals
        await onUpdateTask(taskId, { dueDate: dateStr, dueTime: timeStr });
      }
    },
    [allTasks, onUpdateTask],
  );

  const handleSlotClick = useCallback((dateStr: string, time: string) => {
    setQuickAddState({ isOpen: true, dateStr, time });
  }, []);

  const handleDayClick = useCallback(
    (dateStr: string) => {
      calendar.setMode('week');
      calendar.goToDate(new Date(dateStr + 'T12:00:00'));
    },
    [calendar],
  );

  const handleTaskClick = useCallback(
    (task: Task) => {
      setSelectedTask(task);
    },
    [],
  );

  const handleResizeDuration = useCallback(
    async (taskId: string, duration: number) => {
      await onUpdateTask(taskId, { duration });
    },
    [onUpdateTask],
  );

  const handleQuickAddSubmit = useCallback(
    async (text: string) => {
      const { dateStr, time } = quickAddState;
      // Append date to the text for quick add parsing
      const dateObj = new Date(dateStr + 'T12:00:00');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dateText = `${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;
      const timeText = time !== '09:00' ? ` ${time}` : '';
      await onQuickAdd(`${text} ${dateText}${timeText}`);
      setQuickAddState({ isOpen: false, dateStr: '', time: '' });
    },
    [quickAddState, onQuickAdd],
  );

  // Get selected task data fresh from allTasks
  const currentSelectedTask = selectedTask
    ? allTasks.get(selectedTask.id) || selectedTask
    : null;

  const selectedTaskSubtasks = selectedTask
    ? getSubtasks(allTasks, selectedTask.id)
    : [];

  // Format the date/time for modal title
  const quickAddTitle = quickAddState.isOpen
    ? (() => {
        const d = new Date(quickAddState.dateStr + 'T12:00:00');
        const dateLabel = formatUserDateWithWeekday(d, 'EEE');
        return quickAddState.time !== '09:00'
          ? `Add task - ${dateLabel} at ${quickAddState.time}`
          : `Add task - ${dateLabel}`;
      })()
    : '';

  return (
    <div>
      <CalendarHeader
        headerLabel={calendar.headerLabel}
        mode={calendar.mode}
        onModeChange={calendar.setMode}
        onNavigateBack={calendar.navigateBack}
        onNavigateForward={calendar.navigateForward}
        onGoToToday={calendar.goToToday}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragEnd={handleDragEnd}
      >
        {calendar.mode === 'week' ? (
          <WeekView
            days={calendar.days}
            hours={calendar.hours}
            onTaskClick={handleTaskClick}
            onComplete={onCompleteTask}
            onUncomplete={onUncompleteTask}
            onSlotClick={handleSlotClick}
            onResizeDuration={handleResizeDuration}
          />
        ) : (
          <MonthView
            days={calendar.days}
            onTaskClick={handleTaskClick}
            onComplete={onCompleteTask}
            onUncomplete={onUncompleteTask}
            onDayClick={handleDayClick}
            onSlotClick={handleSlotClick}
          />
        )}
      </DndContext>

      {/* Quick add modal */}
      <Modal
        isOpen={quickAddState.isOpen}
        onClose={() => setQuickAddState({ isOpen: false, dateStr: '', time: '' })}
        title={quickAddTitle}
        size="sm"
      >
        <div className="p-4">
          <QuickAdd
            onSubmit={handleQuickAddSubmit}
            placeholder="Task name"
            autoFocus
            inline={false}
            onCancel={() =>
              setQuickAddState({ isOpen: false, dateStr: '', time: '' })
            }
          />
        </div>
      </Modal>

      {/* Task detail panel */}
      {currentSelectedTask && (
        <TaskDetail
          task={currentSelectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={onUpdateTask}
          onComplete={onCompleteTask}
          onUncomplete={onUncompleteTask}
          onDelete={onDeleteTask}
          onAddSubtask={onAddSubtask}
          subtasks={selectedTaskSubtasks}
        />
      )}
    </div>
  );
}
