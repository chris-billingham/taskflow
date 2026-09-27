import { memo, useState, useRef, useEffect } from 'react';
import {
  MoreHorizontal,
  Trash2,
  Copy,
  GripVertical,
  Pencil,
  ChevronDown,
  User,
  GitBranch,
  Repeat,
} from 'lucide-react';
import { describeRecurrence, shortRecurrenceLabel } from '@/utils/recurrence';
import { TaskCheckbox } from './TaskCheckbox';
import { DueDateBadge } from './DueDatePicker';
import { DueDatePicker } from './DueDatePicker';
import { PriorityPicker } from './PriorityPicker';
import { LabelBadges } from './LabelPicker';
import { useTaskActions } from '@/queries/taskActions';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';
import { useSubtasks } from '@/queries/tasks';
import { useOpenTask } from '@/hooks/useTaskPanel';
import type { Task } from '@/types/task';

interface TaskItemProps {
  task: Task;
  dragHandleProps?: Record<string, any>;
  /** Show an expandable list of the task's subtasks under it. */
  showSubtasks?: boolean;
  isSubtask?: boolean;
}

const priorityBorderColors: Record<number, string> = {
  1: 'border-l-red-500',
  2: 'border-l-orange-500',
  3: 'border-l-blue-500',
  4: 'border-l-transparent',
};

/**
 * A task row. It acts on the task itself (shared task actions) and opens it in
 * the task panel, so lists only need to hand it the task.
 */
export const TaskItem = memo(function TaskItem({
  task,
  dragHandleProps,
  showSubtasks,
  isSubtask,
}: TaskItemProps) {
  const { updateTask, completeTask, uncompleteTask, deleteTask, duplicateTask } = useTaskActions();
  const openTask = useOpenTask();
  const onUpdate = (id: string, data: Record<string, unknown>) => void updateTask(id, data);
  const onClick = (t: Task) => openTask(t.id);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(task.content);
  // Rows whose subtasks came embedded start open; count-only rows (project
  // lists) start closed, so a long list doesn't fetch every row's subtasks.
  const [expanded, setExpanded] = useState(() => task.subtasks !== undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditContent(task.content);
  }, [task.content]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSubmitEdit = () => {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== task.content) {
      onUpdate(task.id, { content: trimmed });
    } else {
      setEditContent(task.content);
    }
    setIsEditing(false);
  };

  const handleCheckboxChange = (checked: boolean) => {
    if (checked) {
      void completeTask(task.id);
    } else {
      void uncompleteTask(task.id);
    }
  };

  // Views embed subtasks; project lists only send a count, so fetch them when
  // the row is expanded.
  const embedded = task.subtasks as Task[] | undefined;
  const countOnly = task._count?.subtasks ?? 0;
  const { data: fetched } = useSubtasks(
    task.id,
    Boolean(showSubtasks && expanded && !embedded && countOnly > 0),
  );
  const subtasks = embedded ?? fetched;
  const subtaskCount = task._count?.subtasks ?? subtasks?.length ?? 0;
  const completedSubtasks = subtasks?.filter((s) => s.isCompleted).length ?? 0;
  const hasSubtasks = subtaskCount > 0;
  const borderColor = priorityBorderColors[task.priority] || priorityBorderColors[4];

  return (
    // No content-visibility here: it implies paint containment, which clipped
    // the row's own menu and date/priority pickers to the row.
    <div>
      <div
        className={`group flex items-start gap-0 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors ${
          task.isCompleted ? 'opacity-60' : ''
        } ${!isSubtask ? `border-l-2 ${borderColor}` : ''}`}
      >
        {/* Drag handle — only for top-level tasks */}
        {dragHandleProps && !isSubtask && (
          <div
            className="pt-3 pl-1 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            {...dragHandleProps}
          >
            <GripVertical className="w-4 h-4 text-gray-300 dark:text-gray-600" />
          </div>
        )}

        {/* Expand/collapse chevron — only when task has subtasks */}
        {showSubtasks && hasSubtasks ? (
          <button
            className="pt-3 px-1 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <ChevronDown
              className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${
                expanded ? '' : '-rotate-90'
              }`}
            />
          </button>
        ) : showSubtasks ? (
          /* Spacer to keep alignment when other tasks in the list have chevrons */
          <div className="w-6 shrink-0" />
        ) : null}

        {/* Checkbox */}
        <div className="pt-3 pr-2 shrink-0">
          <TaskCheckbox
            checked={task.isCompleted}
            priority={task.priority}
            onChange={handleCheckboxChange}
          />
        </div>

        {/* Content area */}
        <div
          className="flex-1 min-w-0 py-2.5 cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-sm"
          role="button"
          tabIndex={0}
          aria-label={`Open task: ${task.content}`}
          onClick={() => {
            if (!isEditing) onClick(task);
          }}
          onKeyDown={(e) => {
            if (isEditing) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClick(task);
            }
          }}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              className="w-full text-sm bg-transparent border-b border-primary-500 outline-hidden py-0.5"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onBlur={handleSubmitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmitEdit();
                if (e.key === 'Escape') {
                  setEditContent(task.content);
                  setIsEditing(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className={`text-sm text-gray-900 dark:text-white ${
                task.isCompleted ? 'line-through text-gray-500 dark:text-gray-400' : ''
              }`}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
            >
              {task.content}
            </span>
          )}

          {/* Meta info row */}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.dueDate && (
              <DueDateBadge dueDate={task.dueDate} dueTime={task.dueTime} />
            )}
            {/* A repeating task looked identical to a one-off in every list —
                completing one silently spawned the next occurrence with no
                indication that it would. */}
            {task.isRecurring && task.recurrenceRule && (
              <span
                className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1"
                title={describeRecurrence(task.recurrenceRule) ?? 'Repeats'}
              >
                <Repeat className="w-3 h-3" />
                {shortRecurrenceLabel(task.recurrenceRule)}
              </span>
            )}
            <LabelBadges labels={task.taskLabels} />
            {/* Subtask count with branch icon like the reference */}
            {hasSubtasks && (
              <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                {completedSubtasks}/{subtaskCount}
              </span>
            )}
            {task.assignee && (
              <span className="flex items-center gap-1" title={task.assignee.name}>
                {task.assignee.avatarUrl ? (
                  <img
                    src={task.assignee.avatarUrl}
                    className="w-4 h-4 rounded-full"
                    alt=""
                  />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                    <User className="w-2.5 h-2.5 text-gray-500 dark:text-gray-400" />
                  </div>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Hover actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-2 pr-1">
          <DueDatePicker
            value={task.dueDate}
            time={task.dueTime}
            onChange={(date, time) => onUpdate(task.id, { dueDate: date, dueTime: time })}
          />
          <PriorityPicker
            value={task.priority}
            onChange={(priority) => onUpdate(task.id, { priority })}
          />

          <Menu label={`Options for ${task.content}`} trigger={<MoreHorizontal className="w-4 h-4" />}>
            <MenuItem icon={Pencil} onSelect={() => setIsEditing(true)}>
              Edit
            </MenuItem>
            <MenuItem icon={Copy} onSelect={() => void duplicateTask(task.id)}>
              Duplicate
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={Trash2} tone="danger" onSelect={() => void deleteTask(task.id)}>
              Delete
            </MenuItem>
          </Menu>
        </div>
      </div>

      {/* Inline subtask list — rendered directly below parent, indented */}
      {showSubtasks && hasSubtasks && expanded && subtasks && (
        <div className="ml-16 border-l border-gray-200 dark:border-gray-700">
          {subtasks.map((sub) => (
            <TaskItem key={sub.id} task={sub} isSubtask />
          ))}
        </div>
      )}
    </div>
  );
});
