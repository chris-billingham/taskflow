import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalendarMode } from '@/hooks/useCalendar';

interface CalendarHeaderProps {
  headerLabel: string;
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  onGoToToday: () => void;
}

export function CalendarHeader({
  headerLabel,
  mode,
  onModeChange,
  onNavigateBack,
  onNavigateForward,
  onGoToToday,
}: CalendarHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <button
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
          onClick={onNavigateBack}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
          onClick={onNavigateForward}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-gray-900 ml-1">
          {headerLabel}
        </h2>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="px-3 py-1.5 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 border border-gray-200"
          onClick={onGoToToday}
        >
          Today
        </button>

        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          <button
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
              mode === 'week'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => onModeChange('week')}
          >
            Week
          </button>
          <button
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
              mode === 'month'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => onModeChange('month')}
          >
            Month
          </button>
        </div>
      </div>
    </div>
  );
}
