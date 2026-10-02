import { useState, useRef, useEffect } from 'react';
import { ChevronRight, GripVertical, Trash2 } from 'lucide-react';
import type { ProjectSection } from '@/types/project';

interface SectionHeaderProps {
  section: ProjectSection;
  /** Without these, the name and section can't be changed. */
  onUpdateName?: (name: string) => void;
  onToggleCollapse: () => void;
  onDelete?: () => void;
  /** Drag listeners for reordering sections; the header grip is the only handle. */
  dragHandleProps?: Record<string, any>;
}

export function SectionHeader({
  section,
  onUpdateName,
  onToggleCollapse,
  onDelete,
  dragHandleProps,
}: SectionHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(section.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const taskCount = section._count?.tasks ?? 0;

  useEffect(() => {
    setEditName(section.name);
  }, [section.name]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSubmit = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== section.name) {
      onUpdateName?.(trimmed);
    } else {
      setEditName(section.name);
    }
    setIsEditing(false);
  };

  return (
    <div className="group flex items-center gap-2 py-2 border-b border-gray-200 dark:border-gray-700">
      {dragHandleProps && (
        <button
          type="button"
          aria-label={`Reorder section ${section.name}`}
          className="-ml-6 w-5 h-5 flex items-center justify-center shrink-0 cursor-grab opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          {...dragHandleProps}
        >
          <GripVertical className="w-4 h-4 text-gray-300 dark:text-gray-600" />
        </button>
      )}
      <button
        className="w-5 h-5 flex items-center justify-center shrink-0"
        onClick={onToggleCollapse}
      >
        <ChevronRight
          className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${
            !section.isCollapsed ? 'rotate-90' : ''
          }`}
        />
      </button>

      {isEditing && onUpdateName ? (
        <input
          ref={inputRef}
          className="text-sm font-semibold text-gray-900 dark:text-white bg-transparent border-b border-primary-500 outline-hidden flex-1"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') {
              setEditName(section.name);
              setIsEditing(false);
            }
          }}
        />
      ) : (
        <span
          className={`text-sm font-semibold text-gray-900 dark:text-white flex-1 ${onUpdateName ? 'cursor-pointer' : ''}`}
          onClick={() => onUpdateName && setIsEditing(true)}
        >
          {section.name}
        </span>
      )}

      {taskCount > 0 && (
        <span className="text-xs text-gray-400 dark:text-gray-500">{taskCount}</span>
      )}

      {onDelete && (
        <button
          className="w-6 h-6 items-center justify-center rounded-sm hover:bg-gray-200 dark:hover:bg-gray-600 hidden group-hover:flex shrink-0"
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
        </button>
      )}
    </div>
  );
}
