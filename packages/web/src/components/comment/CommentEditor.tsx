import { useState, useRef } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import { useUploadLimits, formatFileSize } from '@/hooks/useFileUpload';

interface CommentEditorProps {
  onSubmit: (content: string, files: File[]) => Promise<void>;
  onCancel?: () => void;
  initialContent?: string;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  showAttachments?: boolean;
}

export function CommentEditor({
  onSubmit,
  onCancel,
  initialContent = '',
  placeholder = 'Write a comment...',
  submitLabel = 'Comment',
  autoFocus = false,
  showAttachments = false,
}: CommentEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [submitting, setSubmitting] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const { maxFileSizeMb, allowedMimeTypes } = useUploadLimits();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      await onSubmit(trimmed, pendingFiles);
      setContent('');
      setPendingFiles([]);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const invalid = files.find((f) => !allowedMimeTypes.has(f.type));
    const oversized = files.find((f) => f.size > maxFileSizeMb * 1024 * 1024);
    if (invalid) {
      setFileError(`"${invalid.name}" is not a supported file type`);
    } else if (oversized) {
      setFileError(`"${oversized.name}" exceeds the ${maxFileSizeMb}MB limit`);
    } else {
      setFileError(null);
      setPendingFiles((prev) => [...prev, ...files]);
    }
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <textarea
        ref={textareaRef}
        className="w-full text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg p-3 outline-none focus:border-primary-500 resize-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
        rows={3}
        placeholder={placeholder}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus={autoFocus}
        disabled={submitting}
      />

      {/* Pending files */}
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pendingFiles.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-700 dark:text-gray-300"
            >
              <Paperclip className="w-3 h-3 text-gray-400 dark:text-gray-500" />
              <span className="max-w-[120px] truncate" title={file.name}>
                {file.name}
              </span>
              <span className="text-gray-400 dark:text-gray-500">({formatFileSize(file.size)})</span>
              <button
                className="ml-0.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                onClick={() => removeFile(i)}
                type="button"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {fileError && (
        <div className="text-xs text-red-500">{fileError}</div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400 dark:text-gray-500">
            Markdown supported &middot; Ctrl+Enter to submit
          </span>
          {showAttachments && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                onClick={() => fileInputRef.current?.click()}
                title="Attach files"
                disabled={submitting}
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
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
