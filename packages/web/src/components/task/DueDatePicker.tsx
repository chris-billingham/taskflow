import { useState, useRef, useEffect } from 'react';
import { Calendar, Sun, ArrowRight, X, Clock } from 'lucide-react';

interface DueDatePickerProps {
  value: string | null;
  time?: string | null;
  onChange: (date: string | null, time?: string | null) => void;
}

function formatDateDisplay(dateStr: string | null): string {
  if (!dateStr) return 'No date';
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDateColor(dateStr: string | null): string {
  if (!dateStr) return 'text-gray-400';
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date < today) return 'text-red-500';
  if (date.getTime() === today.getTime()) return 'text-green-600';
  if (date.getTime() === tomorrow.getTime()) return 'text-orange-500';
  return 'text-purple-600';
}

export function DueDatePicker({ value, time, onChange }: DueDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTime, setShowTime] = useState(!!time);
  const [timeValue, setTimeValue] = useState(time || '');
  const [calendarDate, setCalendarDate] = useState(() => {
    if (value) return new Date(value + 'T00:00:00');
    return new Date();
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + (7 - nextWeek.getDay() + 1));

  const toDateStr = (d: Date) => d.toISOString().split('T')[0];

  const quickOptions = [
    { label: 'Today', icon: Calendar, date: toDateStr(today), color: 'text-green-600' },
    { label: 'Tomorrow', icon: Sun, date: toDateStr(tomorrow), color: 'text-orange-500' },
    { label: 'Next week', icon: ArrowRight, date: toDateStr(nextWeek), color: 'text-purple-600' },
  ];

  // Calendar rendering
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const handleSelectDate = (dateStr: string) => {
    onChange(dateStr, showTime ? timeValue || null : null);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-gray-100 ${getDateColor(value)}`}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <Calendar className="w-3.5 h-3.5" />
        {formatDateDisplay(value)}
        {time && <span className="ml-0.5">{time}</span>}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2">
          {/* Quick options */}
          <div className="px-2 pb-2 border-b border-gray-100">
            {quickOptions.map((opt) => (
              <button
                key={opt.label}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-gray-50"
                onClick={() => handleSelectDate(opt.date)}
              >
                <opt.icon className={`w-4 h-4 ${opt.color}`} />
                <span className="text-gray-700">{opt.label}</span>
                <span className="ml-auto text-xs text-gray-400">
                  {new Date(opt.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
              </button>
            ))}
          </div>

          {/* Calendar */}
          <div className="px-3 pt-2">
            <div className="flex items-center justify-between mb-2">
              <button
                className="p-0.5 rounded hover:bg-gray-100 text-gray-500"
                onClick={() => setCalendarDate(new Date(year, month - 1, 1))}
              >
                &lt;
              </button>
              <span className="text-sm font-medium text-gray-700">
                {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button
                className="p-0.5 rounded hover:bg-gray-100 text-gray-500"
                onClick={() => setCalendarDate(new Date(year, month + 1, 1))}
              >
                &gt;
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0 text-center mb-1">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <span key={d} className="text-xs text-gray-400 py-1">
                  {d}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0 text-center">
              {days.map((day, i) => {
                if (day === null) return <span key={`empty-${i}`} />;
                const dateStr = toDateStr(new Date(year, month, day));
                const isSelected = value === dateStr;
                const isToday = dateStr === toDateStr(today);
                return (
                  <button
                    key={day}
                    className={`w-7 h-7 rounded-full text-xs ${
                      isSelected
                        ? 'bg-[#db4c3f] text-white'
                        : isToday
                          ? 'text-[#db4c3f] font-semibold hover:bg-gray-100'
                          : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    onClick={() => handleSelectDate(dateStr)}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time input */}
          <div className="px-3 pt-2 mt-1 border-t border-gray-100">
            {showTime ? (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <input
                  type="time"
                  className="text-sm border border-gray-200 rounded px-2 py-1 flex-1"
                  value={timeValue}
                  onChange={(e) => setTimeValue(e.target.value)}
                />
                <button
                  className="p-0.5 rounded hover:bg-gray-100"
                  onClick={() => {
                    setShowTime(false);
                    setTimeValue('');
                  }}
                >
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </button>
              </div>
            ) : (
              <button
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                onClick={() => setShowTime(true)}
              >
                <Clock className="w-3.5 h-3.5" />
                Add time
              </button>
            )}
          </div>

          {/* Clear button */}
          {value && (
            <div className="px-3 pt-2 mt-1 border-t border-gray-100">
              <button
                className="w-full text-xs text-red-500 hover:text-red-600 py-1"
                onClick={() => {
                  onChange(null, null);
                  setIsOpen(false);
                }}
              >
                Remove due date
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DueDateBadge({ dueDate, dueTime }: { dueDate: string | null; dueTime?: string | null }) {
  if (!dueDate) return null;

  const color = getDateColor(dueDate);
  const label = formatDateDisplay(dueDate);

  return (
    <span className={`flex items-center gap-1 text-xs ${color}`}>
      <Calendar className="w-3 h-3" />
      {label}
      {dueTime && <span>{dueTime}</span>}
    </span>
  );
}
