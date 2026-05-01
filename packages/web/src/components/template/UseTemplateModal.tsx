import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTemplateStore } from '@/stores/templateStore';
import { useProjectStore } from '@/stores/projectStore';
import type { Template } from '@/stores/templateStore';

interface UseTemplateModalProps {
  template: Template;
  onClose: () => void;
  onSuccess?: (projectId: string) => void;
  workspaceId?: string;
}

export function UseTemplateModal({
  template,
  onClose,
  onSuccess,
  workspaceId,
}: UseTemplateModalProps) {
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);
  const setProject = useProjectStore((s) => s.setProject);

  const [name, setName] = useState(template.data.project.name);
  const [destination, setDestination] = useState<'personal' | 'workspace'>(
    workspaceId ? 'workspace' : 'personal',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const project = await applyTemplate(template.id, {
        name: name.trim(),
        workspaceId: destination === 'workspace' ? workspaceId : undefined,
      }) as any;

      if (project) {
        setProject(project);
        onSuccess?.(project.id);
      }
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create project from template');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Use template
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {template.name}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            error={error}
            autoFocus
          />

          {workspaceId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Destination
              </label>
              <div className="flex gap-2">
                {(['personal', 'workspace'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDestination(d)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                      destination === d
                        ? 'bg-[#db4c3f] text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting} disabled={!name.trim()}>
              Create project
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
