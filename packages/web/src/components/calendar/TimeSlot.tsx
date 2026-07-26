import { useDroppable } from '@dnd-kit/core';

interface TimeSlotProps {
  dateStr: string;
  hour: number;
  isCurrentHour: boolean;
  onSlotClick: (dateStr: string, time: string) => void;
}

export function TimeSlot({
  dateStr,
  hour,
  isCurrentHour,
  onSlotClick,
}: TimeSlotProps) {
  const timeStr = `${String(hour).padStart(2, '0')}:00`;
  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${dateStr}-${timeStr}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={`h-12 border-b border-gray-100 dark:border-gray-700 relative transition-colors ${
        isOver ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50/50'
      } ${isCurrentHour ? 'bg-blue-50/30' : ''}`}
      onClick={() => onSlotClick(dateStr, timeStr)}
    >
      {/* 15-min sub-grid lines */}
      <div className="absolute left-0 right-0 top-1/4 border-t border-dashed border-gray-50" />
      <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-gray-100/50" />
      <div className="absolute left-0 right-0 top-3/4 border-t border-dashed border-gray-50" />
    </div>
  );
}
