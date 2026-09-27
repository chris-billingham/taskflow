import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, GripVertical, Pencil, Trash2, Check, X, Star } from 'lucide-react';
import { useLabels, useLabelActions, type Label } from '@/queries/labels';
import { IconButton } from '@/components/ui/IconButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const DEFAULT_COLORS = [
  '#6B7280', '#EF4444', '#F59E0B', '#10B981',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
  '#F97316', '#06B6D4', '#84CC16', '#A855F7',
];

export function LabelManager() {
  const navigate = useNavigate();
  const { labels } = useLabels();
  const { createLabel, updateLabel, deleteLabel, reorderLabels } = useLabelActions();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await createLabel({ name: newName.trim(), color: newColor });
      setNewName('');
      setNewColor(DEFAULT_COLORS[0]);
      setShowCreate(false);
    } catch {
      // Error handled in store
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    await updateLabel(id, { name: editName.trim(), color: editColor });
    setEditingId(null);
  };

  const startEdit = (label: Label) => {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const currentIds = labels.map((l) => l.id);
    const draggedIndex = currentIds.indexOf(draggedId);
    const targetIndex = currentIds.indexOf(targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    currentIds.splice(draggedIndex, 1);
    currentIds.splice(targetIndex, 0, draggedId);

    reorderLabels(currentIds);
    setDraggedId(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Labels</h3>
        <button
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-primary-500 hover:bg-primary-500/5 rounded-lg"
          onClick={() => setShowCreate(!showCreate)}
        >
          <Plus className="w-4 h-4" />
          Add label
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700">
          <input
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-primary-500 mb-2"
            placeholder="Label name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <div className="flex flex-wrap gap-1.5 mb-3">
            {DEFAULT_COLORS.map((color) => (
              <button
                key={color}
                className={`w-6 h-6 rounded-full border-2 ${
                  newColor === color ? 'border-gray-900' : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
                aria-label={`Colour ${color}`}
                aria-pressed={newColor === color}
                onClick={() => setNewColor(color)}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 disabled:opacity-50"
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
            >
              {creating ? 'Adding...' : 'Add'}
            </button>
            <button
              className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              onClick={() => {
                setShowCreate(false);
                setNewName('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Labels list */}
      {labels.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
          No labels yet. Create one to get started.
        </p>
      ) : (
        <div className="space-y-1">
          {labels.map((label) => (
            <div
              key={label.id}
              className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 group"
              draggable
              onDragStart={(e) => handleDragStart(e, label.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, label.id)}
            >
              <GripVertical className="w-4 h-4 text-gray-300 dark:text-gray-600 cursor-grab opacity-0 group-hover:opacity-100" />

              {editingId === label.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <div className="relative">
                    <input
                      type="color"
                      aria-label="Label colour"
                      className="w-6 h-6 rounded-full border-0 cursor-pointer"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                    />
                  </div>
                  <input
                    className="flex-1 px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:border-primary-500"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdate(label.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                  />
                  <IconButton label="Save label" size="sm" onClick={() => handleUpdate(label.id)}>
                    <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </IconButton>
                  <IconButton label="Cancel editing" size="sm" onClick={() => setEditingId(null)}>
                    <X className="w-4 h-4" />
                  </IconButton>
                </div>
              ) : (
                <>
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: label.color }}
                  />
                  <button
                    className="flex-1 text-sm text-gray-700 dark:text-gray-300 text-left hover:text-primary-500 cursor-pointer"
                    onClick={() => navigate(`/labels/${label.id}`)}
                  >
                    {label.name}
                  </button>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    <IconButton
                      label={label.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      size="sm"
                      onClick={() => updateLabel(label.id, { isFavorite: !label.isFavorite })}
                    >
                      {label.isFavorite ? (
                        <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                      ) : (
                        <Star className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                      )}
                    </IconButton>
                    <IconButton label="Edit label" size="sm" onClick={() => startEdit(label)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </IconButton>
                    <IconButton label="Delete label" size="sm" tone="danger" onClick={() => setDeleteConfirm(label.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconButton>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        title="Delete label?"
        message="This will remove the label from all tasks. This action cannot be undone."
        onConfirm={() => {
          if (deleteConfirm) deleteLabel(deleteConfirm);
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
