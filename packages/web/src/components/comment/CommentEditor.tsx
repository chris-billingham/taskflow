import { useState, useRef } from 'react';
import { Send } from 'lucide-react';

interface CommentEditorProps {
  onSubmit: (content: string) => Promise<void>;
  onCancel?: () => void;
  initialContent?: string;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
}

export function CommentEditor({
  onSubmit,
  onCancel,
  initialContent = '',
  placeholder = 'Write a comment...',
  submitLabel = 'Comment',
  autoFocus = false,
}: CommentEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      setContent('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && onCancel) {
      onCancel();
    }
  };

  return (
    <div className="space-y-2">
      <textarea
        ref={textareaRef}
        className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 outline-none focus:border-primary-500 resize-none placeholder:text-gray-400"
        rows={3}
        placeholder={placeholder}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus={autoFocus}
        disabled={submitting}
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400">
          Markdown supported &middot; Ctrl+Enter to submit
        </span>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </button>
          )}
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-primary-500 hover:bg-primary-600 rounded-md disabled:opacity-50"
            onClick={handleSubmit}
            disabled={!content.trim() || submitting}
          >
            <Send className="w-3 h-3" />
            {submitting ? 'Sending...' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
