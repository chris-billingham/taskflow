import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useProjectStore, selectActiveProjects } from '@/stores/projectStore';

const PRESET_COLORS = [
  '#DB4C3F', '#FF9933', '#FAD000', '#7ECC49',
  '#299438', '#6ACCBC', '#158FAD', '#3B82F6',
  '#884DFF', '#AF38EB', '#EB96EB', '#E05194',
  '#808080', '#B8B8B8',
];

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentId?: string;
  workspaceId?: string;
}

export function CreateProjectModal({
  isOpen,
  onClose,
  parentId,
  workspaceId,
}: CreateProjectModalProps) {
  const createProject = useProjectStore((s) => s.createProject);
  const projects = useProjectStore(selectActiveProjects);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [selectedParentId, setSelectedParentId] = useState(parentId ?? '');
  const [viewStyle, setViewStyle] = useState<'LIST' | 'BOARD' | 'CALENDAR'>('LIST');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

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
      await createProject({
        name: name.trim(),
        color,
        parentId: selectedParentId || undefined,
        viewStyle,
        workspaceId,
      });
      setName('');
      setColor('#3B82F6');
      setSelectedParentId('');
      setViewStyle('LIST');
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const parentOptions = projects.filter(
    (p) => !p.isInbox && !p.parentId,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Add project</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
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

          {/* Parent project selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Parent project (optional)
            </label>
            <select
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#db4c3f] focus:border-[#db4c3f]"
              value={selectedParentId}
              onChange={(e) => setSelectedParentId(e.target.value)}
            >
              <option value="">None</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting} disabled={!name.trim()}>
              Add
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
