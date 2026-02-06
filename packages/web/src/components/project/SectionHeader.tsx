import { useState, useRef, useEffect } from 'react';
import { ChevronRight, Trash2 } from 'lucide-react';
import type { ProjectSection } from '@/stores/projectStore';

interface SectionHeaderProps {
  section: ProjectSection;
  onUpdateName: (name: string) => void;
  onToggleCollapse: () => void;
  onDelete: () => void;
}

export function SectionHeader({
  section,
  onUpdateName,
  onToggleCollapse,
  onDelete,
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
      onUpdateName(trimmed);
    } else {
      setEditName(section.name);
    }
    setIsEditing(false);
  };

  return (
    <div className="group flex items-center gap-2 py-2 border-b border-gray-200">
      <button
        className="w-5 h-5 flex items-center justify-center flex-shrink-0"
        onClick={onToggleCollapse}
      >
        <ChevronRight
          className={`w-4 h-4 text-gray-400 transition-transform ${
            !section.isCollapsed ? 'rotate-90' : ''
          }`}
        />
      </button>

      {isEditing ? (
        <input
          ref={inputRef}
          className="text-sm font-semibold text-gray-900 bg-transparent border-b border-[#db4c3f] outline-none flex-1"
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
          className="text-sm font-semibold text-gray-900 cursor-pointer flex-1"
          onClick={() => setIsEditing(true)}
        >
          {section.name}
        </span>
      )}

      {taskCount > 0 && (
        <span className="text-xs text-gray-400">{taskCount}</span>
      )}

      <button
        className="w-6 h-6 items-center justify-center rounded hover:bg-gray-200 hidden group-hover:flex flex-shrink-0"
        onClick={onDelete}
      >
        <Trash2 className="w-3.5 h-3.5 text-gray-400" />
      </button>
    </div>
  );
}
