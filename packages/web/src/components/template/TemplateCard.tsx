import { FileText, Globe, Lock, Users } from 'lucide-react';
import type { Template } from '@/stores/templateStore';

interface TemplateCardProps {
  template: Template;
  onUse: (template: Template) => void;
  onPreview: (template: Template) => void;
}

export function TemplateCard({ template, onUse, onPreview }: TemplateCardProps) {
  const sectionCount = template.data.sections.length;
  const taskCount = template.data.tasks.length;
  const subtaskCount = template.data.tasks.reduce((n, t) => n + t.subtasks.length, 0);

  return (
    <div
      className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md transition-all cursor-pointer"
      onClick={() => onPreview(template)}
    >
      {/* Icon + header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: template.data.project.color + '20' }}
          >
            <FileText className="w-4 h-4" style={{ color: template.data.project.color }} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate">
              {template.name}
            </h3>
            {template.user && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                by {template.user.name}
              </p>
            )}
          </div>
        </div>

        <div className="flex-shrink-0">
          {template.isPublic ? (
            <Globe className="w-3.5 h-3.5 text-gray-400" />
          ) : template.workspaceId ? (
            <Users className="w-3.5 h-3.5 text-gray-400" />
          ) : (
            <Lock className="w-3.5 h-3.5 text-gray-400" />
          )}
        </div>
      </div>

      {/* Description */}
      {template.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">
          {template.description}
        </p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 mb-4">
        {sectionCount > 0 && (
          <span>{sectionCount} section{sectionCount !== 1 ? 's' : ''}</span>
        )}
        {taskCount > 0 && (
          <span>{taskCount + subtaskCount} task{taskCount + subtaskCount !== 1 ? 's' : ''}</span>
        )}
        <span className="capitalize">{template.data.project.viewStyle.toLowerCase()}</span>
      </div>

      {/* Use button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onUse(template);
        }}
        className="w-full py-1.5 px-3 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-[#db4c3f] hover:text-white dark:hover:bg-[#db4c3f] dark:hover:text-white transition-colors"
      >
        Use template
      </button>
    </div>
  );
}
