import { useState, useRef, useEffect } from 'react';
import {
  List,
  LayoutGrid,
  Calendar,
  MoreHorizontal,
  Plus,
  Copy,
  Archive,
  Trash2,
} from 'lucide-react';
import type { Project } from '@/stores/projectStore';

interface ProjectHeaderProps {
  project: Project;
  onUpdateName: (name: string) => void;
  onUpdateViewStyle: (viewStyle: 'LIST' | 'BOARD' | 'CALENDAR') => void;
  onAddSection: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function ProjectHeader({
  project,
  onUpdateName,
  onUpdateViewStyle,
  onAddSection,
  onDuplicate,
  onArchive,
  onDelete,
}: ProjectHeaderProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [showMenu, setShowMenu] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditName(project.name);
  }, [project.name]);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleNameSubmit = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== project.name) {
      onUpdateName(trimmed);
    } else {
      setEditName(project.name);
    }
    setIsEditingName(false);
  };

  const viewStyleIcons = {
    LIST: List,
    BOARD: LayoutGrid,
    CALENDAR: Calendar,
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <span
          className="w-3.5 h-3.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: project.color }}
        />

        {isEditingName ? (
          <input
            ref={nameInputRef}
            className="text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-[#db4c3f] outline-none flex-1"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameSubmit();
              if (e.key === 'Escape') {
                setEditName(project.name);
                setIsEditingName(false);
              }
            }}
          />
        ) : (
          <h1
            className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-gray-700"
            onClick={() => !project.isInbox && setIsEditingName(true)}
          >
            {project.name}
          </h1>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {/* View style switcher */}
          {(['LIST', 'BOARD', 'CALENDAR'] as const).map((style) => {
            const Icon = viewStyleIcons[style];
            return (
              <button
                key={style}
                className={`p-1.5 rounded transition-colors ${
                  project.viewStyle === style
                    ? 'bg-gray-200 text-gray-900'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
                onClick={() => onUpdateViewStyle(style)}
                title={style.charAt(0) + style.slice(1).toLowerCase()}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1">
          <button
            className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 rounded hover:bg-gray-100"
            onClick={onAddSection}
          >
            <Plus className="w-4 h-4" />
            Add section
          </button>

          {/* More menu */}
          <div className="relative">
            <button
              className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              onClick={() => setShowMenu(!showMenu)}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                  <button
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => {
                      setShowMenu(false);
                      onDuplicate();
                    }}
                  >
                    <Copy className="w-4 h-4" />
                    Duplicate project
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => {
                      setShowMenu(false);
                      onArchive();
                    }}
                  >
                    <Archive className="w-4 h-4" />
                    {project.isArchived ? 'Unarchive' : 'Archive'}
                  </button>
                  {!project.isInbox && (
                    <>
                      <hr className="my-1 border-gray-200" />
                      <button
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                        onClick={() => {
                          setShowMenu(false);
                          onDelete();
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete project
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
