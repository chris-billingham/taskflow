import { useState, useRef, useEffect } from 'react';
import { Tag, Search, Check } from 'lucide-react';
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

export function LabelPicker({ selectedIds, onChange }: LabelPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [labels, setLabels] = useState<Label[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && labels.length === 0) {
      setLoading(true);
      api
        .get('/users/me/labels')
        .then(({ data }) => setLabels(data.data || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen, labels.length]);

  const filteredLabels = labels.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleLabel = (labelId: string) => {
    if (selectedIds.includes(labelId)) {
      onChange(selectedIds.filter((id) => id !== labelId));
    } else {
      onChange([...selectedIds, labelId]);
    }
  };

  const selectedLabels = labels.filter((l) => selectedIds.includes(l.id));

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <Tag className="w-3.5 h-3.5" />
        {selectedLabels.length > 0 ? `${selectedLabels.length} labels` : 'Labels'}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-56 bg-white rounded-lg shadow-lg border border-gray-200">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#db4c3f]"
                placeholder="Search labels..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {/* Label list */}
          <div className="max-h-48 overflow-y-auto py-1">
            {loading ? (
              <p className="px-3 py-2 text-xs text-gray-400">Loading...</p>
            ) : filteredLabels.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">
                {search ? 'No labels found' : 'No labels yet'}
              </p>
            ) : (
              filteredLabels.map((label) => {
                const isSelected = selectedIds.includes(label.id);
                return (
                  <button
                    key={label.id}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50"
                    onClick={() => toggleLabel(label.id)}
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="text-gray-700 flex-1 text-left truncate">
                      {label.name}
                    </span>
                    {isSelected && (
                      <Check className="w-4 h-4 text-[#db4c3f]" />
                    )}
                  </button>
                );
              })
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
