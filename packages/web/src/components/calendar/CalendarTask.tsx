import { useDraggable } from '@dnd-kit/core';
import { TaskCheckbox } from '@/components/task/TaskCheckbox';
import type { Task } from '@/stores/taskStore';

interface CalendarTaskProps {
  task: Task;
  variant: 'week' | 'month';
  style?: React.CSSProperties;
  onTaskClick: (task: Task) => void;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
}

const priorityBorderColors: Record<number, string> = {
  1: 'border-l-red-500',
  2: 'border-l-orange-500',
  3: 'border-l-blue-500',
  4: 'border-l-gray-200',
};

const priorityBgColors: Record<number, string> = {
  1: 'bg-red-50',
  2: 'bg-orange-50',
  3: 'bg-blue-50',
  4: 'bg-gray-50',
};

function formatEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const totalMins = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMins / 60) % 24;
  const endM = totalMins % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

function formatTime12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${hour12}${period}` : `${hour12}:${String(m).padStart(2, '0')}${period}`;
}

export function CalendarTask({
  task,
  variant,
  style,
  onTaskClick,
  onComplete,
  onUncomplete,
}: CalendarTaskProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: task.id });

  const dragStyle: React.CSSProperties = {
    ...style,
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
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
            {formatTime12(task.dueTime)}
          </span>
        )}
      </div>
    );
  }

  // Week variant
  const timeLabel = task.dueTime
    ? task.duration
      ? `${formatTime12(task.dueTime)} - ${formatTime12(formatEndTime(task.dueTime, task.duration))}`
      : formatTime12(task.dueTime)
    : '';

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      {...attributes}
      {...listeners}
      className={`absolute left-0.5 right-0.5 border-l-2 ${borderColor} ${bgColor} rounded px-1.5 py-1 cursor-pointer overflow-hidden group/task hover:shadow-md transition-shadow`}
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
      <div className="absolute bottom-0 left-0 right-0 h-1.5 cursor-s-resize opacity-0 group-hover/task:opacity-100 bg-gray-300/30 rounded-b" />
    </div>
  );
}
