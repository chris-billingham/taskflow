import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useTemplateActions } from '@/queries/templates';
import { useProjects } from '@/queries/projects';

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
  const { createTemplate } = useTemplateActions();
  const { active: projects } = useProjects();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(preselectedProjectId ?? '');
  const [shareWithWorkspace, setShareWithWorkspace] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

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
    <Modal isOpen={isOpen} onClose={onClose} title="Save as template">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {/* Source project */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Source project
          </label>
          <select
            className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
            className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
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
                className="rounded-sm border-gray-300 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Share with workspace
              </span>
            </label>
          )}
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
    </Modal>
  );
}
