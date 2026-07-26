import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';

interface BoardAddColumnProps {
  onCreateSection: (name: string) => Promise<unknown>;
}

export function BoardAddColumn({ onCreateSection }: BoardAddColumnProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  const handleSubmit = async () => {
    if (!name.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onCreateSection(name.trim());
      setName('');
      setIsExpanded(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setName('');
    setIsExpanded(false);
  };

  if (!isExpanded) {
    return (
      <div className="min-w-[280px] w-[280px] flex-shrink-0">
        <button
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          onClick={() => setIsExpanded(true)}
        >
          <Plus className="w-4 h-4" />
          Add section
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-[280px] w-[280px] flex-shrink-0">
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
        <input
          ref={inputRef}
          className="w-full text-sm font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 outline-none focus:border-[#db4c3f]"
          placeholder="Section name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
            if (e.key === 'Escape') handleCancel();
          }}
        />
        <div className="flex items-center justify-end gap-2 mt-2">
          <button
            className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1 text-xs font-medium text-white bg-[#db4c3f] hover:bg-[#c53727] rounded disabled:opacity-50"
            onClick={handleSubmit}
            disabled={!name.trim() || isSubmitting}
          >
            Add section
          </button>
        </div>
      </div>
    </div>
  );
}
