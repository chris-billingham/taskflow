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
import { Modal } from '@/components/ui/Modal';
import { QuickAdd } from '@/components/task/QuickAdd';
import type { Task } from '@/types/task';
import { useTaskActions } from '@/queries/taskActions';
import { formatUserDateWithWeekday } from '@/utils/dateFormat';

interface CalendarViewProps {
  tasks: Task[];
  /** Tasks added from a calendar cell go here; otherwise quick-add decides. */
  defaultProjectId?: string;
  initialMode?: CalendarMode;
  /** No adding tasks from a cell (you can only view the project). */
  readOnly?: boolean;
}

export function CalendarView({
  tasks,
  defaultProjectId,
  initialMode = 'week',
  readOnly,
}: CalendarViewProps) {
  const calendar = useCalendar(tasks, initialMode);
  const { updateTask, quickAddTask } = useTaskActions();
  const onUpdateTask = useCallback(
    async (id: string, data: Record<string, unknown>) => {
      await updateTask(id, data);
    },
    [updateTask],
  );
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
        const task = tasks.find((t) => t.id === taskId);
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
    [tasks, onUpdateTask],
  );

  const handleSlotClick = useCallback(
    (dateStr: string, time: string) => {
      if (!readOnly) setQuickAddState({ isOpen: true, dateStr, time });
    },
    [readOnly],
  );

  const handleDayClick = useCallback(
    (dateStr: string) => {
      calendar.setMode('week');
      calendar.goToDate(new Date(dateStr + 'T12:00:00'));
    },
    [calendar],
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
      // Send the cell's date (and a clicked week-view slot's time) as values,
      // used unless the text names its own. Writing them into the text for the
      // parser put past and same-day dates a year out ("Sep 27" < now) and
      // left a bare "14:00" in the name.
      await quickAddTask(text, defaultProjectId, {
        defaultDueDate: dateStr,
        defaultDueTime: time !== '09:00' ? time : undefined,
      });
      setQuickAddState({ isOpen: false, dateStr: '', time: '' });
    },
    [quickAddState, quickAddTask, defaultProjectId],
  );

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
            onSlotClick={handleSlotClick}
            onResizeDuration={handleResizeDuration}
          />
        ) : (
          <MonthView
            days={calendar.days}
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
            projectId={defaultProjectId}
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
    </div>
  );
}
