import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import type { ProjectTreeNode } from '@/stores/projectStore';

interface ProjectItemProps {
  project: ProjectTreeNode;
  depth?: number;
  onEdit: (project: ProjectTreeNode) => void;
  onDelete: (project: ProjectTreeNode) => void;
  onArchive: (project: ProjectTreeNode) => void;
  onDuplicate: (project: ProjectTreeNode) => void;
  onToggleFavorite: (project: ProjectTreeNode) => void;
}

export function ProjectItem({
  project,
  depth = 0,
  onEdit,
  onDelete,
  onArchive,
  onDuplicate,
  onToggleFavorite,
}: ProjectItemProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const isActive = location.pathname === `/projects/${project.id}`;
  const hasChildren = project.childNodes.length > 0;
  const taskCount = project._count?.tasks ?? 0;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer text-sm ${
          isActive
            ? 'bg-[#db4c3f]/10 text-[#db4c3f]'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => navigate(`/projects/${project.id}`)}
      >
        {/* Expand/collapse arrow */}
        <button
          className={`w-5 h-5 flex items-center justify-center flex-shrink-0 ${
            hasChildren ? 'visible' : 'invisible'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
        >
          <ChevronRight
            className={`w-3.5 h-3.5 text-gray-400 dark:text-gray-500 transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
        </button>

        {/* Color dot */}
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: project.color }}
        />

        {/* Name */}
        <span className="flex-1 truncate">{project.name}</span>

        {/* Task count */}
        {taskCount > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{taskCount}</span>
        )}

        {/* More actions */}
        <div className="relative flex-shrink-0">
          <button
            className="w-6 h-6 items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600 hidden group-hover:flex"
            title="Project options"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <MoreHorizontal className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                }}
              />
              <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1">
                <button
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onEdit(project);
                  }}
                >
                  Edit project
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onToggleFavorite(project);
                  }}
                >
                  {project.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onDuplicate(project);
                  }}
                >
                  Duplicate
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onArchive(project);
                  }}
                >
                  {project.isArchived ? 'Unarchive' : 'Archive'}
                </button>
                <hr className="my-1 border-gray-200 dark:border-gray-700" />
                <button
                  className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onDelete(project);
                  }}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {project.childNodes.map((child) => (
            <ProjectItem
              key={child.id}
              project={child}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onArchive={onArchive}
              onDuplicate={onDuplicate}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  );
}
