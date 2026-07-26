import { useDroppable } from '@dnd-kit/core';
import { CalendarTask } from './CalendarTask';
import type { CalendarDay } from '@/hooks/useCalendar';
import type { Task } from '@/stores/taskStore';

interface DayCellProps {
  day: CalendarDay;
  onTaskClick: (task: Task) => void;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onDayClick: (dateStr: string) => void;
  onSlotClick: (dateStr: string, time: string) => void;
}

const MAX_VISIBLE_TASKS = 3;

export function DayCell({
  day,
  onTaskClick,
  onComplete,
  onUncomplete,
  onDayClick,
  onSlotClick,
}: DayCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${day.dateStr}`,
  });

  const visibleTasks = day.tasks.slice(0, MAX_VISIBLE_TASKS);
  const extraCount = day.tasks.length - MAX_VISIBLE_TASKS;

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[100px] border-b border-r border-gray-200 dark:border-gray-700 p-1 transition-colors ${
        isOver ? 'bg-blue-50 dark:bg-blue-900/20' : ''
      } ${!day.isCurrentMonth ? 'bg-gray-50/50' : ''}`}
      onClick={() => onSlotClick(day.dateStr, '09:00')}
    >
      {/* Date number */}
      <button
        className={`w-7 h-7 flex items-center justify-center rounded-full text-sm mb-1 ${
          day.isToday
            ? 'bg-[#db4c3f] text-white font-bold'
            : !day.isCurrentMonth
              ? 'text-gray-300 dark:text-gray-600'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onDayClick(day.dateStr);
        }}
      >
        {day.date.getDate()}
      </button>

      {/* Tasks */}
      <div className="space-y-0.5" onClick={(e) => e.stopPropagation()}>
        {visibleTasks.map((task) => (
          <CalendarTask
            key={task.id}
            task={task}
            variant="month"
            onTaskClick={onTaskClick}
            onComplete={onComplete}
            onUncomplete={onUncomplete}
          />
        ))}
        {extraCount > 0 && (
          <button
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-1"
            onClick={(e) => {
              e.stopPropagation();
              onDayClick(day.dateStr);
            }}
          >
            +{extraCount} more
          </button>
        )}
      </div>
    </div>
  );
}
