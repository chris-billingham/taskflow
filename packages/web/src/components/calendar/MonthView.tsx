import { DayCell } from './DayCell';
import type { CalendarDay } from '@/hooks/useCalendar';

interface MonthViewProps {
  days: CalendarDay[];
  onDayClick: (dateStr: string) => void;
  onSlotClick: (dateStr: string, time: string) => void;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthView({
  days,
  onDayClick,
  onSlotClick,
}: MonthViewProps) {
  return (
    <div>
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
        {WEEKDAY_NAMES.map((name) => (
          <div
            key={name}
            className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-2 border-r border-gray-200 dark:border-gray-700 last:border-r-0"
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
            onDayClick={onDayClick}
            onSlotClick={onSlotClick}
          />
        ))}
      </div>
    </div>
  );
}
