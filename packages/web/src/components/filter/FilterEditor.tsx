import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Play, Star } from 'lucide-react';
import { useFilterStore, selectFiltersArray } from '@/stores/filterStore';
import { FilterQueryInput } from './FilterQueryInput';
import type { Filter } from '@/stores/filterStore';

const DEFAULT_COLORS = [
  '#6B7280', '#EF4444', '#F59E0B', '#10B981',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
  '#F97316', '#06B6D4', '#84CC16', '#A855F7',
];

export function FilterEditor() {
  const navigate = useNavigate();
  const filters = useFilterStore(selectFiltersArray);
  const createFilter = useFilterStore((s) => s.createFilter);
  const updateFilter = useFilterStore((s) => s.updateFilter);
  const deleteFilter = useFilterStore((s) => s.deleteFilter);
  const executeFilter = useFilterStore((s) => s.executeFilter);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQuery, setNewQuery] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [queryValid, setQueryValid] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editQuery, setEditQuery] = useState('');
  const [editColor, setEditColor] = useState('');

  const [previewQuery, setPreviewQuery] = useState<string | null>(null);
  const [previewResults, setPreviewResults] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim() || !newQuery.trim() || creating || !queryValid) return;
    setCreating(true);
    try {
      await createFilter({ name: newName.trim(), query: newQuery.trim(), color: newColor });
      setNewName('');
      setNewQuery('');
      setNewColor(DEFAULT_COLORS[0]);
      setShowCreate(false);
    } catch {
      // Error handled in store
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim() || !editQuery.trim()) return;
    await updateFilter(id, { name: editName.trim(), query: editQuery.trim(), color: editColor });
    setEditingId(null);
  };

  const startEdit = (filter: Filter) => {
    setEditingId(filter.id);
    setEditName(filter.name);
    setEditQuery(filter.query);
    setEditColor(filter.color);
  };

  const handlePreview = async (query: string) => {
    setPreviewQuery(query);
    setPreviewLoading(true);
    try {
      const results = await executeFilter(query);
      setPreviewResults(results);
    } catch {
      setPreviewResults([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filters</h3>
        <button
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-[#db4c3f] hover:bg-[#db4c3f]/5 rounded-lg"
          onClick={() => setShowCreate(!showCreate)}
        >
          <Plus className="w-4 h-4" />
          Add filter
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700">
          <input
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-[#db4c3f] mb-2"
            placeholder="Filter name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <div className="mb-2">
            <FilterQueryInput
              value={newQuery}
              onChange={setNewQuery}
              onValidation={(r) => setQueryValid(r.valid)}
              placeholder="Filter query, e.g. today & p1"
            />
          </div>
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
          <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            <p className="font-medium mb-1">Available operators:</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              <span>today, tomorrow, overdue</span>
              <span>p1, p2, p3, p4</span>
              <span>#Project, @label</span>
              <span>assigned to: me</span>
              <span>search: keyword</span>
              <span>due: date</span>
              <span>& (and), | (or), ! (not)</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 text-sm font-medium text-white bg-[#db4c3f] rounded-lg hover:bg-[#c53829] disabled:opacity-50"
              onClick={handleCreate}
              disabled={!newName.trim() || !newQuery.trim() || creating || !queryValid}
            >
              {creating ? 'Adding...' : 'Add'}
            </button>
            {newQuery.trim() && queryValid && (
              <button
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                onClick={() => handlePreview(newQuery)}
              >
                <Play className="w-3.5 h-3.5" /> Preview
              </button>
            )}
            <button
              className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              onClick={() => {
                setShowCreate(false);
                setNewName('');
                setNewQuery('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters list */}
      {filters.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
          No filters yet. Create one to save common queries.
        </p>
      ) : (
        <div className="space-y-1">
          {filters.map((filter) => (
            <div key={filter.id}>
              {editingId === filter.id ? (
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700">
                  <input
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-[#db4c3f] mb-2"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                  />
                  <div className="mb-2">
                    <FilterQueryInput
                      value={editQuery}
                      onChange={setEditQuery}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {DEFAULT_COLORS.map((color) => (
                      <button
                        key={color}
                        className={`w-6 h-6 rounded-full border-2 ${
                          editColor === color ? 'border-gray-900' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setEditColor(color)}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="px-3 py-1.5 text-sm font-medium text-white bg-[#db4c3f] rounded-lg hover:bg-[#c53829]"
                      onClick={() => handleUpdate(filter.id)}
                    >
                      Save
                    </button>
                    <button
                      className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 group">
                  <span
                    className="w-3 h-3 rounded flex-shrink-0"
                    style={{ backgroundColor: filter.color }}
                  />
                  <button
                    className="flex-1 min-w-0 text-left cursor-pointer"
                    onClick={() => navigate(`/filters/${filter.id}`)}
                  >
                    <div className="text-sm text-gray-700 dark:text-gray-300 hover:text-[#db4c3f]">{filter.name}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">{filter.query}</div>
                  </button>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                      onClick={() => updateFilter(filter.id, { isFavorite: !filter.isFavorite })}
                      title={filter.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {filter.isFavorite ? (
                        <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                      ) : (
                        <Star className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                      )}
                    </button>
                    <button
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                      onClick={() => handlePreview(filter.query)}
                      title="Preview results"
                    >
                      <Play className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    </button>
                    <button
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                      onClick={() => startEdit(filter)}
                    >
                      <Pencil className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    </button>
                    <button
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => setDeleteConfirm(filter.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 hover:text-red-500" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Preview results */}
      {previewQuery && (
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700">
              Preview: <span className="font-mono">{previewQuery}</span>
            </span>
            <button
              className="text-xs text-blue-500 hover:underline"
              onClick={() => {
                setPreviewQuery(null);
                setPreviewResults([]);
              }}
            >
              Close
            </button>
          </div>
          {previewLoading ? (
            <p className="text-xs text-blue-500">Loading...</p>
          ) : previewResults.length === 0 ? (
            <p className="text-xs text-blue-500">No matching tasks found</p>
          ) : (
            <ul className="space-y-1">
              {previewResults.slice(0, 10).map((task: any) => (
                <li key={task.id} className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${task.isCompleted ? 'bg-green-400' : 'bg-gray-400'}`} />
                  {task.content}
                  {task.project && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">({task.project.name})</span>
                  )}
                </li>
              ))}
              {previewResults.length > 10 && (
                <li className="text-xs text-blue-500">
                  ...and {previewResults.length - 10} more
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 mx-4 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete filter?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                onClick={() => {
                  deleteFilter(deleteConfirm);
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
