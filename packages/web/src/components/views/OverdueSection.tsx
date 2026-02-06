import { useState } from 'react';
import { ChevronDown, Clock } from 'lucide-react';
import { TaskItem } from '@/components/task/TaskItem';
import type { Task } from '@/stores/taskStore';

interface OverdueSectionProps {
  tasks: Task[];
  allTasks: Map<string, Task>;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onTaskClick: (task: Task) => void;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRescheduleAll?: () => void;
}

export function OverdueSection({
  tasks,
  allTasks,
  onComplete,
  onUncomplete,
  onTaskClick,
  onUpdate,
  onDelete,
  onDuplicate,
  onRescheduleAll,
}: OverdueSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (tasks.length === 0) return null;

  return (
    <div className="mb-4 bg-red-50 border border-red-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          className="flex items-center gap-2 text-sm font-medium text-red-700"
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          />
          <Clock className="w-4 h-4" />
          Overdue
          <span className="text-xs font-normal bg-red-200 text-red-800 px-1.5 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </button>
        {onRescheduleAll && (
          <button
            className="text-xs font-medium text-red-600 hover:text-red-800 hover:bg-red-100 px-2 py-1 rounded"
            onClick={onRescheduleAll}
          >
            Reschedule all
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="px-1 pb-1">
          {tasks.map((task) => {
            const subtasks = Array.from(allTasks.values())
              .filter((t) => t.parentId === task.id)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            return (
              <TaskItem
                key={task.id}
                task={task}
                onComplete={onComplete}
                onUncomplete={onUncomplete}
                onClick={onTaskClick}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
                showSubtasks
                subtasks={subtasks}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
