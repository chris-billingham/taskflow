import { useRef, useState, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { TaskCheckbox } from '@/components/task/TaskCheckbox';
import { formatUserTimeCompact } from '@/utils/dateFormat';
import type { Task } from '@/stores/taskStore';

interface CalendarTaskProps {
  task: Task;
  variant: 'week' | 'month';
  style?: React.CSSProperties;
  onTaskClick: (task: Task) => void;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onResizeDuration?: (taskId: string, duration: number) => void;
}

const priorityBorderColors: Record<number, string> = {
  1: 'border-l-red-500',
  2: 'border-l-orange-500',
  3: 'border-l-blue-500',
  4: 'border-l-gray-200',
};

const priorityBgColors: Record<number, string> = {
  1: 'bg-red-100',
  2: 'bg-orange-100',
  3: 'bg-blue-100',
  4: 'bg-gray-100',
};

// Must match WeekView HOUR_HEIGHT
const HOUR_HEIGHT = 48;

function formatEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const totalMins = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMins / 60) % 24;
  const endM = totalMins % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

export function CalendarTask({
  task,
  variant,
  style,
  onTaskClick,
  onComplete,
  onUncomplete,
  onResizeDuration,
}: CalendarTaskProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: task.id });

  const [resizeHeightOverride, setResizeHeightOverride] = useState<number | null>(null);
  const resizingRef = useRef(false);
  const pendingDurationRef = useRef<number>(0);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Prevent dnd-kit drag and click-through
      e.stopPropagation();
      e.preventDefault();

      const startY = e.clientY;
      const startDuration = task.duration || 30;
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      resizingRef.current = true;
      pendingDurationRef.current = startDuration;

      const onMove = (moveE: PointerEvent) => {
        const deltaY = moveE.clientY - startY;
        const deltaMinutes = (deltaY / HOUR_HEIGHT) * 60;
        // Snap to 15-min intervals, minimum 15 minutes
        const newDuration = Math.max(15, Math.round((startDuration + deltaMinutes) / 15) * 15);
        pendingDurationRef.current = newDuration;
        setResizeHeightOverride(Math.max((newDuration / 60) * HOUR_HEIGHT, 20));
      };

      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('lostpointercapture', onUp);
        resizingRef.current = false;
        setResizeHeightOverride(null);

        if (pendingDurationRef.current !== startDuration && onResizeDuration) {
          onResizeDuration(task.id, pendingDurationRef.current);
        }
      };

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('lostpointercapture', onUp);
    },
    [task.id, task.duration, onResizeDuration],
  );

  const dragStyle: React.CSSProperties = {
    ...style,
    ...(resizeHeightOverride !== null ? { height: `${resizeHeightOverride}px` } : {}),
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging || resizeHeightOverride !== null ? 50 : undefined,
  };

  const borderColor = priorityBorderColors[task.priority] || priorityBorderColors[4];
  const bgColor = priorityBgColors[task.priority] || priorityBgColors[4];

  if (variant === 'month') {
    return (
      <div
        ref={setNodeRef}
        style={dragStyle}
        {...attributes}
        {...listeners}
        className={`flex items-center gap-1 px-1 py-0.5 rounded text-xs border-l-2 ${borderColor} bg-white hover:bg-gray-50 cursor-pointer truncate group/task`}
        onClick={(e) => {
          e.stopPropagation();
          onTaskClick(task);
        }}
      >
        <div
          className="flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <TaskCheckbox
            checked={task.isCompleted}
            priority={task.priority}
            onChange={(checked) => {
              if (checked) onComplete(task.id);
              else onUncomplete(task.id);
            }}
          />
        </div>
        <span className="truncate text-gray-900">{task.content}</span>
        {task.dueTime && (
          <span className="text-gray-400 flex-shrink-0 ml-auto">
            {formatUserTimeCompact(task.dueTime)}
          </span>
        )}
      </div>
    );
  }

  // Week variant
  const displayDuration = resizeHeightOverride !== null
    ? pendingDurationRef.current
    : (task.duration || 30);
  const timeLabel = task.dueTime
    ? displayDuration
      ? `${formatUserTimeCompact(task.dueTime)} - ${formatUserTimeCompact(formatEndTime(task.dueTime, displayDuration))}`
      : formatUserTimeCompact(task.dueTime)
    : '';

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      {...attributes}
      {...listeners}
      className={`absolute left-0.5 right-0.5 border-l-2 ${borderColor} ${bgColor} rounded px-1.5 py-1 cursor-pointer overflow-hidden group/task shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow`}
      onClick={(e) => {
        e.stopPropagation();
        onTaskClick(task);
      }}
    >
      <div className="flex items-start gap-1">
        <div
          className="flex-shrink-0 mt-0.5"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <TaskCheckbox
            checked={task.isCompleted}
            priority={task.priority}
            onChange={(checked) => {
              if (checked) onComplete(task.id);
              else onUncomplete(task.id);
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-900 truncate">
            {task.content}
          </p>
          {timeLabel && (
            <p className="text-[10px] text-gray-500 mt-0.5">{timeLabel}</p>
          )}
        </div>
      </div>
      {/* Resize handle */}
      <div
        className="absolute bottom-0 left-0 right-0 h-2.5 cursor-s-resize opacity-0 group-hover/task:opacity-100 hover:!opacity-100 bg-gray-400/30 rounded-b"
        onPointerDown={handleResizePointerDown}
      />
    </div>
  );
}
