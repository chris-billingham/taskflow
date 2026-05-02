import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Project } from '@/stores/projectStore';

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

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Edit project" className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Edit project</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                />
              ))}
            </div>
          </div>

          {/* View style */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              View
            </label>
            <div className="flex gap-2">
              {(['LIST', 'BOARD', 'CALENDAR'] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    viewStyle === style
                      ? 'bg-[#db4c3f] text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-white rounded-xl p-6 flex flex-col items-center justify-center">
            <p className="text-lg font-semibold text-gray-900 mb-2">
              Delete project?
            </p>
            <p className="text-sm text-gray-600 mb-6 text-center">
              This will permanently delete "{project.name}" and all its tasks.
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete}>
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
