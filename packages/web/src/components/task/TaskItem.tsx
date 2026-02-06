import { useState, useRef, useEffect } from 'react';
import {
  MoreHorizontal,
  Trash2,
  Copy,
  GripVertical,
  ChevronDown,
  User,
  GitBranch,
} from 'lucide-react';
import { TaskCheckbox } from './TaskCheckbox';
import { DueDateBadge } from './DueDatePicker';
import { DueDatePicker } from './DueDatePicker';
import { PriorityPicker } from './PriorityPicker';
import { LabelBadges } from './LabelPicker';
import type { Task } from '@/stores/taskStore';

interface TaskItemProps {
  task: Task;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onClick: (task: Task) => void;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  dragHandleProps?: Record<string, any>;
  showSubtasks?: boolean;
  subtasks?: Task[];
  isSubtask?: boolean;
}

const priorityBorderColors: Record<number, string> = {
  1: 'border-l-red-500',
  2: 'border-l-orange-500',
  3: 'border-l-blue-500',
  4: 'border-l-transparent',
};

export function TaskItem({
  task,
  onComplete,
  onUncomplete,
  onClick,
  onUpdate,
  onDelete,
  onDuplicate,
  dragHandleProps,
  showSubtasks,
  subtasks,
  isSubtask,
}: TaskItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(task.content);
  const [showMenu, setShowMenu] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditContent(task.content);
  }, [task.content]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      onComplete(task.id);
    } else {
      onUncomplete(task.id);
    }
  };

  const subtaskCount = task._count?.subtasks ?? subtasks?.length ?? 0;
  const completedSubtasks = subtasks?.filter((s) => s.isCompleted).length ?? 0;
  const hasSubtasks = subtaskCount > 0;
  const borderColor = priorityBorderColors[task.priority] || priorityBorderColors[4];

  return (
    <div>
      <div
        className={`group flex items-start gap-0 border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${
          task.isCompleted ? 'opacity-60' : ''
        } ${!isSubtask ? `border-l-2 ${borderColor}` : ''}`}
      >
        {/* Drag handle — only for top-level tasks */}
        {dragHandleProps && !isSubtask && (
          <div
            className="pt-3 pl-1 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            {...dragHandleProps}
          >
            <GripVertical className="w-4 h-4 text-gray-300" />
          </div>
        )}

        {/* Expand/collapse chevron — only when task has subtasks */}
        {showSubtasks && hasSubtasks ? (
          <button
            className="pt-3 px-1 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <ChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform ${
                expanded ? '' : '-rotate-90'
              }`}
            />
          </button>
        ) : showSubtasks ? (
          /* Spacer to keep alignment when other tasks in the list have chevrons */
          <div className="w-6 flex-shrink-0" />
        ) : null}

        {/* Checkbox */}
        <div className="pt-3 pr-2 flex-shrink-0">
          <TaskCheckbox
            checked={task.isCompleted}
            priority={task.priority}
            onChange={handleCheckboxChange}
          />
        </div>

        {/* Content area */}
        <div
          className="flex-1 min-w-0 py-2.5 cursor-pointer"
          onClick={() => {
            if (!isEditing) onClick(task);
          }}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              className="w-full text-sm bg-transparent border-b border-[#db4c3f] outline-none py-0.5"
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
              className={`text-sm text-gray-900 ${
                task.isCompleted ? 'line-through text-gray-500' : ''
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
            <LabelBadges labels={task.taskLabels} />
            {/* Subtask count with branch icon like the reference */}
            {hasSubtasks && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
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
                  <div className="w-4 h-4 rounded-full bg-gray-300 flex items-center justify-center">
                    <User className="w-2.5 h-2.5 text-gray-500" />
                  </div>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Hover actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 pt-2 pr-1">
          <DueDatePicker
            value={task.dueDate}
            time={task.dueTime}
            onChange={(date, time) => onUpdate(task.id, { dueDate: date, dueTime: time })}
          />
          <PriorityPicker
            value={task.priority}
            onChange={(priority) => onUpdate(task.id, { priority })}
          />

          {/* More menu */}
          <div className="relative" ref={menuRef}>
            <button
              className="p-1.5 rounded hover:bg-gray-200"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
            >
              <MoreHorizontal className="w-4 h-4 text-gray-400" />
            </button>

            {showMenu && (
              <div className="absolute top-full right-0 mt-1 z-50 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                    setShowMenu(false);
                  }}
                >
                  Edit
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(task.id);
                    setShowMenu(false);
                  }}
                >
                  <Copy className="w-4 h-4" />
                  Duplicate
                </button>
                <hr className="my-1 border-gray-100" />
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(task.id);
                    setShowMenu(false);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inline subtask list — rendered directly below parent, indented */}
      {showSubtasks && hasSubtasks && expanded && subtasks && (
        <div className="ml-16 border-l border-gray-200">
          {subtasks.map((sub) => (
            <TaskItem
              key={sub.id}
              task={sub}
              onComplete={onComplete}
              onUncomplete={onUncomplete}
              onClick={onClick}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              isSubtask
            />
          ))}
        </div>
      )}
    </div>
  );
}
