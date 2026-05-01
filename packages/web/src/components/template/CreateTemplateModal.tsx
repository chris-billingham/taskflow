import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTemplateStore } from '@/stores/templateStore';
import { useProjectStore, selectActiveProjects } from '@/stores/projectStore';

interface CreateTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedProjectId?: string;
  workspaceId?: string;
}

export function CreateTemplateModal({
  isOpen,
  onClose,
  preselectedProjectId,
  workspaceId,
}: CreateTemplateModalProps) {
  const createTemplate = useTemplateStore((s) => s.createTemplate);
  const projects = useProjectStore(selectActiveProjects);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(preselectedProjectId ?? '');
  const [isPublic, setIsPublic] = useState(false);
  const [shareWithWorkspace, setShareWithWorkspace] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }
    if (!projectId) {
      setError('Please select a source project');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await createTemplate({
        name: name.trim(),
        description: description.trim() || undefined,
        projectId,
        isPublic,
        workspaceId: shareWithWorkspace ? workspaceId : undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create template');
    } finally {
      setIsSubmitting(false);
    }
  };

  const sourceProjects = projects.filter((p) => !p.isInbox);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Save as template
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Source project */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Source project
            </label>
            <select
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#db4c3f] focus:border-[#db4c3f]"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Select a project</option>
              {sourceProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name"
            error={error}
            autoFocus
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#db4c3f] focus:border-[#db4c3f] resize-none"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this template is for..."
            />
          </div>

          {/* Visibility options */}
          <div className="space-y-2">
            {workspaceId && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareWithWorkspace}
                  onChange={(e) => setShareWithWorkspace(e.target.checked)}
                  className="rounded border-gray-300 text-[#db4c3f] focus:ring-[#db4c3f]"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Share with workspace
                </span>
              </label>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="rounded border-gray-300 text-[#db4c3f] focus:ring-[#db4c3f]"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Make public (visible in gallery)
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isSubmitting}
              disabled={!name.trim() || !projectId}
            >
              Save template
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
