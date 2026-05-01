import { X, ChevronRight, Globe, Lock, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Template, TemplateTask } from '@/stores/templateStore';

interface TemplatePreviewProps {
  template: Template;
  onUse: () => void;
  onClose: () => void;
}

function TaskRow({ task }: { task: TemplateTask }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 py-1">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          task.priority === 1 ? 'bg-red-500' :
          task.priority === 2 ? 'bg-orange-500' :
          task.priority === 3 ? 'bg-blue-500' : 'bg-gray-300'
        }`} />
        <span className="text-sm text-gray-700 dark:text-gray-300">{task.content}</span>
        {task.labels.map((l) => (
          <span key={l} className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full">
            {l}
          </span>
        ))}
      </div>
      {task.subtasks.map((st, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5 pl-5">
          <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
          <span className="text-xs text-gray-500 dark:text-gray-400">{st.content}</span>
        </div>
      ))}
    </div>
  );
}

export function TemplatePreview({ template, onUse, onClose }: TemplatePreviewProps) {
  const { data } = template;

  // Group tasks by sectionIndex
  const tasksBySection = new Map<number | undefined, TemplateTask[]>();
  for (const task of data.tasks) {
    const key = task.sectionIndex;
    if (!tasksBySection.has(key)) tasksBySection.set(key, []);
    tasksBySection.get(key)!.push(task);
  }

  const unsectionedTasks = tasksBySection.get(undefined) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex-shrink-0"
              style={{ backgroundColor: data.project.color }}
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {template.name}
                </h2>
                {template.isPublic ? (
                  <Globe className="w-4 h-4 text-gray-400" />
                ) : template.workspaceId ? (
                  <Users className="w-4 h-4 text-gray-400" />
                ) : (
                  <Lock className="w-4 h-4 text-gray-400" />
                )}
              </div>
              {template.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {template.description}
                </p>
              )}
              {template.user && (
                <p className="text-xs text-gray-400 mt-1">by {template.user.name}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Meta */}
          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span>{data.sections.length} section{data.sections.length !== 1 ? 's' : ''}</span>
            <span>
              {data.tasks.length + data.tasks.reduce((n, t) => n + t.subtasks.length, 0)} tasks
            </span>
            <span className="capitalize">{data.project.viewStyle.toLowerCase()} view</span>
          </div>

          {/* Unsectioned tasks */}
          {unsectionedTasks.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
                No section
              </h3>
              <div className="space-y-0.5">
                {unsectionedTasks.map((t, i) => <TaskRow key={i} task={t} />)}
              </div>
            </div>
          )}

          {/* Sections */}
          {data.sections.map((section, idx) => {
            const tasks = tasksBySection.get(idx) ?? [];
            return (
              <div key={idx}>
                <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
                  {section.name}
                </h3>
                {tasks.length > 0 ? (
                  <div className="space-y-0.5">
                    {tasks.map((t, i) => <TaskRow key={i} task={t} />)}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No tasks</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={onUse}>Use template</Button>
        </div>
      </div>
    </div>
  );
}
