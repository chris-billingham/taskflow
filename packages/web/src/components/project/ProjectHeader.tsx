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
  UserPlus,
  History,
  CalendarPlus,
  Webhook,
} from 'lucide-react';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';
import type { Project } from '@/types/project';
import { atLeast } from '@/hooks/useProjectAccess';

interface ProjectHeaderProps {
  project: Project;
  onUpdateName: (name: string) => void;
  onUpdateViewStyle: (viewStyle: 'LIST' | 'BOARD' | 'CALENDAR') => void;
  onAddSection: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onShare: () => void;
  onShowActivity: () => void;
  onCalendarFeed: () => void;
  onWebhooks: () => void;
}

export function ProjectHeader({
  project,
  onUpdateName,
  onUpdateViewStyle,
  onAddSection,
  onDuplicate,
  onArchive,
  onDelete,
  onShare,
  onShowActivity,
  onCalendarFeed,
  onWebhooks,
}: ProjectHeaderProps) {
  // Unknown (an older response) counts as admin: the server checks anyway.
  const access = project.access ?? 'ADMIN';
  const isAdmin = atLeast(access, 'ADMIN');
  const canEdit = atLeast(access, 'EDIT');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(project.name);
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
          className="w-3.5 h-3.5 rounded-full shrink-0"
          style={{ backgroundColor: project.color }}
        />

        {isEditingName && isAdmin ? (
          <input
            ref={nameInputRef}
            className="text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-primary-500 outline-hidden flex-1"
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
            className={`text-2xl font-bold text-gray-900 dark:text-white ${
              isAdmin && !project.isInbox ? 'cursor-pointer hover:text-gray-700 dark:hover:text-gray-200' : ''
            }`}
            onClick={() => isAdmin && !project.isInbox && setIsEditingName(true)}
          >
            {project.name}
          </h1>
        )}
      </div>

      {project.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line mb-3 max-w-prose">
          {project.description}
        </p>
      )}

      {project.isArchived && (
        <div className="flex items-center justify-between gap-3 mb-3 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-300">
          <span>This project is archived and hidden from the sidebar.</span>
          {isAdmin && (
            <button
              type="button"
              className="shrink-0 font-medium text-primary-600 dark:text-primary-400 hover:underline"
              onClick={onArchive}
            >
              Unarchive
            </button>
          )}
        </div>
      )}

      {!canEdit && (
        <p
          role="note"
          className="mb-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-200"
        >
          {access === 'COMMENT'
            ? 'You can view and comment on this project, but not change its tasks.'
            : 'You can view this project, but not change it.'}{' '}
          Tasks assigned to you can still be edited.
        </p>
      )}

      <div className="flex items-center justify-between">
        {/* The view is the project's, so only admins can switch it. */}
        <div className={`flex items-center gap-1 ${isAdmin ? '' : 'invisible'}`}>
          {/* View style switcher */}
          {(['LIST', 'BOARD', 'CALENDAR'] as const).map((style) => {
            const Icon = viewStyleIcons[style];
            return (
              <button
                key={style}
                className={`p-1.5 rounded transition-colors ${
                  project.viewStyle === style
                    ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
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
          {!project.isInbox && (
            <button
              className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 dark:text-gray-400 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={onShare}
            >
              <UserPlus className="w-4 h-4" aria-hidden="true" />
              Share
            </button>
          )}
          {canEdit && (
            <button
              className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 dark:text-gray-400 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={onAddSection}
            >
              <Plus className="w-4 h-4" />
              Add section
            </button>
          )}

          <Menu label="Project options" trigger={<MoreHorizontal className="w-4 h-4" />} menuClassName="w-48">
            <MenuItem icon={History} onSelect={onShowActivity}>
              Activity
            </MenuItem>
            <MenuItem icon={CalendarPlus} onSelect={onCalendarFeed}>
              Calendar feed
            </MenuItem>
            {isAdmin && (
              <MenuItem icon={Webhook} onSelect={onWebhooks}>
                Webhooks
              </MenuItem>
            )}
            <MenuItem icon={Copy} onSelect={onDuplicate}>
              Duplicate project
            </MenuItem>
            {isAdmin && (
              <MenuItem icon={Archive} onSelect={onArchive}>
                {project.isArchived ? 'Unarchive' : 'Archive'}
              </MenuItem>
            )}
            {!project.isInbox && isAdmin && (
              <>
                <MenuSeparator />
                <MenuItem icon={Trash2} tone="danger" onSelect={onDelete}>
                  Delete project
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>
    </div>
  );
}
