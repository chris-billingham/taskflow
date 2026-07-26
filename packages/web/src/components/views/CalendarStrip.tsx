import { useEffect, useRef } from 'react';
import { format, isToday, addDays, startOfDay } from 'date-fns';

interface CalendarStripProps {
  days: number;
  taskCountByDate: Record<string, number>;
  onDateClick: (date: string) => void;
  selectedDate?: string;
}

export function CalendarStrip({
  days,
  taskCountByDate,
  onDateClick,
  selectedDate,
}: CalendarStripProps) {
  const todayRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const dates: Date[] = [];
  const start = startOfDay(new Date());
  for (let i = 0; i < days; i++) {
    dates.push(addDays(start, i));
  }

  useEffect(() => {
    if (todayRef.current && containerRef.current) {
      todayRef.current.scrollIntoView({
        behavior: 'instant',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-thin"
    >
      {dates.map((date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const today = isToday(date);
        const selected = selectedDate === dateStr;
        const count = taskCountByDate[dateStr] || 0;

        return (
          <button
            key={dateStr}
            ref={today ? todayRef : undefined}
            className={`flex-shrink-0 w-12 h-14 flex flex-col items-center justify-center rounded-lg text-xs transition-colors ${
              today
                ? 'bg-[#db4c3f] text-white'
                : selected
                  ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
            onClick={() => onDateClick(dateStr)}
          >
            <span className="font-medium">{format(date, 'EEE')}</span>
            <span className={`text-sm font-bold ${today ? 'text-white' : ''}`}>
              {format(date, 'd')}
            </span>
            {count > 0 && (
              <span
                className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                  today ? 'bg-white/70' : 'bg-[#db4c3f]'
                }`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
