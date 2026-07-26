import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { User, GitBranch, MessageSquare } from 'lucide-react';
import { TaskCheckbox } from '@/components/task/TaskCheckbox';
import { DueDateBadge } from '@/components/task/DueDatePicker';
import { LabelBadges } from '@/components/task/LabelPicker';
import type { Task } from '@/stores/taskStore';

interface BoardCardProps {
  task: Task;
  subtasks?: Task[];
  onClick: (task: Task) => void;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
}

const priorityBorderColors: Record<number, string> = {
  1: 'border-l-red-500',
  2: 'border-l-orange-500',
  3: 'border-l-blue-500',
  4: 'border-l-transparent',
};

export function BoardCard({
  task,
  subtasks,
  onClick,
  onComplete,
  onUncomplete,
}: BoardCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { type: 'card', task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const borderColor = priorityBorderColors[task.priority] || priorityBorderColors[4];
  const subtaskCount = task._count?.subtasks ?? subtasks?.length ?? 0;
  const completedSubtasks = subtasks?.filter((s) => s.isCompleted).length ?? 0;
  const commentCount = task._count?.comments ?? 0;

  const handleCheckbox = (checked: boolean) => {
    if (checked) {
      onComplete(task.id);
    } else {
      onUncomplete(task.id);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 border-l-2 ${borderColor} p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#db4c3f]/40 ${
        task.isCompleted ? 'opacity-60' : ''
      }`}
      role="button"
      tabIndex={0}
      aria-label={`Open task: ${task.content}`}
      onClick={() => onClick(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onClick(task);
        }
      }}
    >
      <div className="flex items-start gap-2">
        <div
          className="flex-shrink-0 mt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <TaskCheckbox
            checked={task.isCompleted}
            priority={task.priority}
            onChange={handleCheckbox}
          />
        </div>
        <span
          className={`text-sm text-gray-900 dark:text-white flex-1 ${
            task.isCompleted ? 'line-through text-gray-500 dark:text-gray-400' : ''
          }`}
        >
          {task.content}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {task.dueDate && (
          <DueDateBadge dueDate={task.dueDate} dueTime={task.dueTime} />
        )}
        <LabelBadges labels={task.taskLabels} />
        {subtaskCount > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
            <GitBranch className="w-3 h-3" />
            {completedSubtasks}/{subtaskCount}
          </span>
        )}
        {commentCount > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            {commentCount}
          </span>
        )}
        {task.assignee && (
          <span className="ml-auto flex items-center" title={task.assignee.name}>
            {task.assignee.avatarUrl ? (
              <img
                src={task.assignee.avatarUrl}
                className="w-5 h-5 rounded-full"
                alt=""
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                <User className="w-3 h-3 text-gray-500 dark:text-gray-400" />
              </div>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

export function BoardCardOverlay({ task }: { task: Task }) {
  const borderColor = priorityBorderColors[task.priority] || priorityBorderColors[4];

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 border-l-2 ${borderColor} p-3 shadow-lg rotate-[3deg] opacity-90 w-[260px]`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 mt-0.5">
          <TaskCheckbox
            checked={task.isCompleted}
            priority={task.priority}
            onChange={() => {}}
          />
        </div>
        <span className="text-sm text-gray-900 dark:text-white">{task.content}</span>
      </div>
    </div>
  );
}
