import { useState, useRef, useEffect } from 'react';
import { Tag, Search, Check, Plus } from 'lucide-react';
import api from '@/services/api';

interface Label {
  id: string;
  name: string;
  color: string;
}

interface LabelPickerProps {
  selectedIds: string[];
  onChange: (labelIds: string[]) => void;
}

const DEFAULT_COLORS = [
  '#6B7280', '#EF4444', '#F59E0B', '#10B981',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
];

export function LabelPicker({ selectedIds, onChange }: LabelPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [labels, setLabels] = useState<Label[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchLabels = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/labels');
      setLabels(data.data || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLabels();
    }
  }, [isOpen]);

  const filteredLabels = labels.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase()),
  );

  const canCreate =
    search.trim().length > 0 &&
    !labels.some((l) => l.name.toLowerCase() === search.trim().toLowerCase());

  const toggleLabel = (labelId: string) => {
    if (selectedIds.includes(labelId)) {
      onChange(selectedIds.filter((id) => id !== labelId));
    } else {
      onChange([...selectedIds, labelId]);
    }
  };

  const handleCreateLabel = async () => {
    if (!search.trim() || creating) return;
    setCreating(true);
    try {
      const color = DEFAULT_COLORS[labels.length % DEFAULT_COLORS.length];
      const { data } = await api.post('/labels', {
        name: search.trim(),
        color,
      });
      const newLabel = data.data as Label;
      setLabels((prev) => [...prev, newLabel]);
      onChange([...selectedIds, newLabel.id]);
      setSearch('');
    } catch {
      // silently fail
    } finally {
      setCreating(false);
    }
  };

  const selectedLabels = labels.filter((l) => selectedIds.includes(l.id));

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <Tag className="w-3.5 h-3.5" />
        {selectedLabels.length > 0 ? `${selectedLabels.length} labels` : 'Labels'}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          {/* Search */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
              <input
                className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:border-[#db4c3f]"
                placeholder="Search or create label..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canCreate) {
                    e.preventDefault();
                    handleCreateLabel();
                  }
                }}
                autoFocus
              />
            </div>
          </div>

          {/* Label list */}
          <div className="max-h-48 overflow-y-auto py-1">
            {loading ? (
              <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">Loading...</p>
            ) : (
              <>
                {filteredLabels.map((label) => {
                  const isSelected = selectedIds.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                      onClick={() => toggleLabel(label.id)}
                    >
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="text-gray-700 dark:text-gray-300 flex-1 text-left truncate">
                        {label.name}
                      </span>
                      {isSelected && (
                        <Check className="w-4 h-4 text-[#db4c3f]" />
                      )}
                    </button>
                  );
                })}

                {filteredLabels.length === 0 && !canCreate && (
                  <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No labels yet</p>
                )}

                {/* Create new label option */}
                {canCreate && (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-[#db4c3f]"
                    onClick={handleCreateLabel}
                    disabled={creating}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="flex-1 text-left truncate">
                      {creating ? 'Creating...' : `Create "${search.trim()}"`}
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function LabelBadges({ labels }: { labels: { label: { id: string; name: string; color: string } }[] }) {
  if (!labels || labels.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {labels.map(({ label }) => (
        <span
          key={label.id}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
          style={{
            backgroundColor: label.color + '20',
            color: label.color,
          }}
        >
          {label.name}
        </span>
      ))}
    </div>
  );
}
