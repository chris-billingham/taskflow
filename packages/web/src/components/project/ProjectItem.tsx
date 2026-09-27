import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';
import type { ProjectTreeNode } from '@/types/project';

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
  const isActive = location.pathname === `/projects/${project.id}`;
  const hasChildren = project.childNodes.length > 0;
  const taskCount = project._count?.tasks ?? 0;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer text-sm ${
          isActive
            ? 'bg-primary-500/10 text-primary-500'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => navigate(`/projects/${project.id}`)}
      >
        {/* Expand/collapse arrow */}
        <button
          className={`w-5 h-5 flex items-center justify-center shrink-0 ${
            hasChildren ? 'visible' : 'invisible'
          }`}
          aria-label={isExpanded ? 'Collapse subprojects' : 'Expand subprojects'}
          aria-expanded={isExpanded}
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
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: project.color }}
        />

        {/* Name */}
        <span className="flex-1 truncate">{project.name}</span>

        {/* Task count */}
        {taskCount > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{taskCount}</span>
        )}

        {/* More actions. Kept in the layout (not display:none) while hidden so
            keyboard users can still tab to it. */}
        <div className="shrink-0">
          <Menu
            label={`Options for ${project.name}`}
            trigger={<MoreHorizontal className="w-4 h-4" />}
            triggerVariant="plain"
            triggerClassName="w-6 h-6 inline-flex items-center justify-center rounded-sm text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
            menuClassName="w-48"
          >
            <MenuItem onSelect={() => onEdit(project)}>Edit project</MenuItem>
            <MenuItem onSelect={() => onToggleFavorite(project)}>
              {project.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            </MenuItem>
            <MenuItem onSelect={() => onDuplicate(project)}>Duplicate</MenuItem>
            <MenuItem onSelect={() => onArchive(project)}>
              {project.isArchived ? 'Unarchive' : 'Archive'}
            </MenuItem>
            <MenuSeparator />
            <MenuItem tone="danger" onSelect={() => onDelete(project)}>
              Delete
            </MenuItem>
          </Menu>
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
