import { useState } from 'react';
import { Plus, GripVertical, Pencil, Trash2, Check, X, Star } from 'lucide-react';
import { useLabelStore, selectLabelsArray } from '@/stores/labelStore';
import type { Label } from '@/stores/labelStore';

const DEFAULT_COLORS = [
  '#6B7280', '#EF4444', '#F59E0B', '#10B981',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
  '#F97316', '#06B6D4', '#84CC16', '#A855F7',
];

export function LabelManager() {
  const labels = useLabelStore(selectLabelsArray);
  const createLabel = useLabelStore((s) => s.createLabel);
  const updateLabel = useLabelStore((s) => s.updateLabel);
  const deleteLabel = useLabelStore((s) => s.deleteLabel);
  const reorderLabels = useLabelStore((s) => s.reorderLabels);

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
        <h3 className="text-lg font-semibold text-gray-900">Labels</h3>
        <button
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-[#db4c3f] hover:bg-[#db4c3f]/5 rounded-lg"
          onClick={() => setShowCreate(!showCreate)}
        >
          <Plus className="w-4 h-4" />
          Add label
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <input
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#db4c3f] mb-2"
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
                onClick={() => setNewColor(color)}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 text-sm font-medium text-white bg-[#db4c3f] rounded-lg hover:bg-[#c53829] disabled:opacity-50"
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
            >
              {creating ? 'Adding...' : 'Add'}
            </button>
            <button
              className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
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
        <p className="text-sm text-gray-500 py-4 text-center">
          No labels yet. Create one to get started.
        </p>
      ) : (
        <div className="space-y-1">
          {labels.map((label) => (
            <div
              key={label.id}
              className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 group"
              draggable
              onDragStart={(e) => handleDragStart(e, label.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, label.id)}
            >
              <GripVertical className="w-4 h-4 text-gray-300 cursor-grab opacity-0 group-hover:opacity-100" />

              {editingId === label.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <div className="relative">
                    <input
                      type="color"
                      className="w-6 h-6 rounded-full border-0 cursor-pointer"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                    />
                  </div>
                  <input
                    className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#db4c3f]"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdate(label.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                  />
                  <button
                    className="p-1 rounded hover:bg-green-50 text-green-600"
                    onClick={() => handleUpdate(label.id)}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    className="p-1 rounded hover:bg-gray-100 text-gray-400"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="flex-1 text-sm text-gray-700">{label.name}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      className="p-1 rounded hover:bg-gray-200"
                      onClick={() => updateLabel(label.id, { isFavorite: !label.isFavorite })}
                      title={label.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {label.isFavorite ? (
                        <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                      ) : (
                        <Star className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </button>
                    <button
                      className="p-1 rounded hover:bg-gray-200"
                      onClick={() => startEdit(label)}
                    >
                      <Pencil className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                    <button
                      className="p-1 rounded hover:bg-red-50"
                      onClick={() => setDeleteConfirm(label.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 mx-4 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete label?</h3>
            <p className="text-sm text-gray-600 mb-6">
              This will remove the label from all tasks. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                onClick={() => {
                  deleteLabel(deleteConfirm);
                  setDeleteConfirm(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
