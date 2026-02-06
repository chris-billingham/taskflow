import { DayCell } from './DayCell';
import type { CalendarDay } from '@/hooks/useCalendar';
import type { Task } from '@/stores/taskStore';

interface MonthViewProps {
  days: CalendarDay[];
  onTaskClick: (task: Task) => void;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onDayClick: (dateStr: string) => void;
  onSlotClick: (dateStr: string, time: string) => void;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthView({
  days,
  onTaskClick,
  onComplete,
  onUncomplete,
  onDayClick,
  onSlotClick,
}: MonthViewProps) {
  return (
    <div>
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {WEEKDAY_NAMES.map((name) => (
          <div
            key={name}
            className="text-center text-xs font-medium text-gray-500 py-2 border-r border-gray-200 last:border-r-0"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map((day) => (
          <DayCell
            key={day.dateStr}
            day={day}
            onTaskClick={onTaskClick}
            onComplete={onComplete}
            onUncomplete={onUncomplete}
            onDayClick={onDayClick}
            onSlotClick={onSlotClick}
          />
        ))}
      </div>
    </div>
  );
}
