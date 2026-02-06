import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { TaskList } from '@/components/task/TaskList';
import { QuickAdd } from '@/components/task/QuickAdd';
import type { Task } from '@/stores/taskStore';

interface DateSectionProps {
  date: string; // YYYY-MM-DD
  tasks: Task[];
  allTasks: Map<string, Task>;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onTaskClick: (task: Task) => void;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (taskIds: string[]) => void;
  onAddTask?: (text: string) => Promise<void>;
  externalDnd?: boolean;
}

function formatDateHeader(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEEE, MMM d');
}

function formatDateSub(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date) || isTomorrow(date)) {
    return format(date, 'MMM d');
  }
  return '';
}

export function DateSection({
  date,
  tasks,
  allTasks,
  onComplete,
  onUncomplete,
  onTaskClick,
  onUpdate,
  onDelete,
  onDuplicate,
  onReorder,
  onAddTask,
  externalDnd = false,
}: DateSectionProps) {
  const headerText = formatDateHeader(date);
  const subText = formatDateSub(date);
  const today = isToday(parseISO(date));

  return (
    <div id={`date-section-${date}`} className="mb-4">
      <div className="sticky top-0 bg-white z-10 flex items-center gap-2 py-2 border-b border-gray-200">
        <h3
          className={`text-sm font-semibold ${
            today ? 'text-[#db4c3f]' : 'text-gray-700'
          }`}
        >
          {headerText}
        </h3>
        {subText && (
          <span className="text-xs text-gray-400">{subText}</span>
        )}
        {tasks.length > 0 && (
          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
            {tasks.length}
          </span>
        )}
      </div>
      <TaskList
        tasks={tasks}
        allTasks={allTasks}
        onComplete={onComplete}
        onUncomplete={onUncomplete}
        onTaskClick={onTaskClick}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onReorder={onReorder}
        emptyMessage="No tasks"
        externalDnd={externalDnd}
      />
      {onAddTask && (
        <div className="mt-1">
          <QuickAdd onSubmit={onAddTask} placeholder="Add task" />
        </div>
      )}
    </div>
  );
}
