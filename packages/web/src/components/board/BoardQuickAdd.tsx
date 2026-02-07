import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';

interface BoardQuickAddProps {
  onSubmit: (content: string) => Promise<void>;
}

export function BoardQuickAdd({ onSubmit }: BoardQuickAddProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  const handleSubmit = async () => {
    if (!text.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(text.trim());
      setText('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setText('');
    setIsExpanded(false);
  };

  if (!isExpanded) {
    return (
      <button
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-sm text-gray-500 hover:text-[#db4c3f] transition-colors rounded-lg hover:bg-white/60"
        onClick={() => setIsExpanded(true)}
      >
        <Plus className="w-4 h-4" />
        Add task
      </button>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-2">
      <input
        ref={inputRef}
        className="w-full text-sm bg-transparent outline-none placeholder-gray-400 py-1"
        placeholder="Task name"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
          if (e.key === 'Escape') handleCancel();
        }}
      />
      <div className="flex items-center justify-end gap-2 mt-1">
        <button
          className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded"
          onClick={handleCancel}
        >
          Cancel
        </button>
        <button
          className="px-2 py-1 text-xs font-medium text-white bg-[#db4c3f] hover:bg-[#c53727] rounded disabled:opacity-50"
          onClick={handleSubmit}
          disabled={!text.trim() || isSubmitting}
        >
          Add
        </button>
      </div>
    </div>
  );
}
