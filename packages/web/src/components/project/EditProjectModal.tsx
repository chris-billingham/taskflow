import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import type { Project } from '@/types/project';

const PRESET_COLORS = [
  '#DB4C3F', '#FF9933', '#FAD000', '#7ECC49',
  '#299438', '#6ACCBC', '#158FAD', '#3B82F6',
  '#884DFF', '#AF38EB', '#EB96EB', '#E05194',
  '#808080', '#B8B8B8',
];

interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
}

export function EditProjectModal({
  isOpen,
  onClose,
  project,
  onUpdate,
  onDelete,
  onArchive,
}: EditProjectModalProps) {
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState(project.color);
  const [viewStyle, setViewStyle] = useState(project.viewStyle);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setName(project.name);
    setColor(project.color);
    setViewStyle(project.viewStyle);
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await onUpdate(project.id, {
        name: name.trim(),
        color,
        viewStyle,
      });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    try {
      await onDelete(project.id);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete project');
    }
  };

  const handleArchive = async () => {
    try {
      await onArchive(project.id);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to archive project');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit project">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <Input
          name="name"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
          error={error}
          autoFocus
        />

        {/* Color picker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Color
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  color === c ? 'border-gray-900 scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
              />
            ))}
          </div>
        </div>

        {/* View style */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            View
          </label>
          <div className="flex gap-2">
            {(['LIST', 'BOARD', 'CALENDAR'] as const).map((style) => (
              <button
                key={style}
                type="button"
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  viewStyle === style
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
                onClick={() => setViewStyle(style)}
              >
                {style.charAt(0) + style.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <div className="flex gap-2">
            {!project.isInbox && (
              <>
                <Button
                  variant="secondary"
                  type="button"
                  size="sm"
                  onClick={handleArchive}
                >
                  {project.isArchived ? 'Unarchive' : 'Archive'}
                </Button>
                <Button
                  variant="danger"
                  type="button"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isSubmitting}
              disabled={!name.trim()}
            >
              Save
            </Button>
          </div>
        </div>
      </form>

      {/* Stacks over this dialog; Escape backs out of the confirm only. */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete project?"
        message={`This will permanently delete "${project.name}" and all its tasks.`}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </Modal>
  );
}
