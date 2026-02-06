import { useState, useRef, useEffect } from 'react';
import { Plus, Calendar, Flag, Tag } from 'lucide-react';

interface QuickAddProps {
  projectId?: string;
  sectionId?: string;  // reserved for future section-scoped add
  parentId?: string;   // reserved for future subtask add
  onSubmit: (text: string) => Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  inline?: boolean;
}

interface ParsePreview {
  priority?: number;
  dueDate?: string;
  project?: string;
  labels?: string[];
}

function parsePreview(text: string): ParsePreview {
  const preview: ParsePreview = {};

  // Priority
  const priorityMatch = text.match(/\b[pP]([1-4])\b/);
  if (priorityMatch) {
    preview.priority = parseInt(priorityMatch[1], 10);
  } else {
    const excl = text.match(/(!{1,3})(?!\w)/);
    if (excl) preview.priority = Math.max(1, 4 - excl[1].length);
  }

  // Project
  const projectMatch = text.match(/#(\S+)/);
  if (projectMatch) preview.project = projectMatch[1];

  // Labels
  const labelMatches = text.matchAll(/@(\S+)/g);
  const labels: string[] = [];
  for (const m of labelMatches) labels.push(m[1]);
  if (labels.length > 0) preview.labels = labels;

  // Due date keywords
  const datePatterns = ['today', 'tomorrow', 'next week', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const pattern of datePatterns) {
    if (text.toLowerCase().includes(pattern)) {
      preview.dueDate = pattern.charAt(0).toUpperCase() + pattern.slice(1);
      break;
    }
  }
  // "in X days"
  const inDaysMatch = text.match(/\bin\s+(\d+)\s+days?\b/i);
  if (inDaysMatch) preview.dueDate = `In ${inDaysMatch[1]} days`;

  return preview;
}

const priorityColors: Record<number, string> = {
  1: 'text-red-500',
  2: 'text-orange-500',
  3: 'text-blue-500',
  4: 'text-gray-400',
};

export function QuickAdd({
  projectId: _projectId,
  sectionId: _sectionId,
  parentId: _parentId,
  onSubmit,
  placeholder = 'Add task',
  autoFocus,
  onCancel,
  inline = true,
}: QuickAddProps) {
  const [isExpanded, setIsExpanded] = useState(autoFocus || false);
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  const preview = text ? parsePreview(text) : null;
  const hasPreview = preview && (preview.priority || preview.dueDate || preview.project || preview.labels);

  const handleSubmit = async () => {
    if (!text.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(text.trim());
      setText('');
      if (!inline) {
        // Keep expanded for inline usage, close for modal
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setText('');
    setIsExpanded(false);
    onCancel?.();
  };

  if (!isExpanded && inline) {
    return (
      <button
        className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-500 hover:text-[#db4c3f] transition-colors rounded-lg hover:bg-gray-50"
        onClick={() => setIsExpanded(true)}
      >
        <Plus className="w-4 h-4" />
        {placeholder}
      </button>
    );
  }

  return (
    <div className={`${inline ? 'border border-gray-200 rounded-lg' : ''}`}>
      <div className="p-2">
        <input
          ref={inputRef}
          className="w-full text-sm bg-transparent outline-none placeholder-gray-400 py-1"
          placeholder={`${placeholder} (use #project, @label, p1-4, today, tomorrow...)`}
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

        {/* Parsed preview */}
        {hasPreview && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {preview.dueDate && (
              <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                <Calendar className="w-3 h-3" />
                {preview.dueDate}
              </span>
            )}
            {preview.priority && (
              <span className={`flex items-center gap-1 text-xs ${priorityColors[preview.priority]} bg-gray-50 px-1.5 py-0.5 rounded`}>
                <Flag className="w-3 h-3" fill={preview.priority < 4 ? 'currentColor' : 'none'} />
                P{preview.priority}
              </span>
            )}
            {preview.project && (
              <span className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                #{preview.project}
              </span>
            )}
            {preview.labels?.map((label) => (
              <span
                key={label}
                className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded"
              >
                <Tag className="w-3 h-3" />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between px-2 py-1.5 border-t border-gray-100">
        <div className="flex items-center gap-1">
          {/* Additional action buttons could go here */}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1 text-xs font-medium text-white bg-[#db4c3f] hover:bg-[#c53727] rounded disabled:opacity-50"
            onClick={handleSubmit}
            disabled={!text.trim() || isSubmitting}
          >
            {isSubmitting ? 'Adding...' : 'Add task'}
          </button>
        </div>
      </div>
    </div>
  );
}
