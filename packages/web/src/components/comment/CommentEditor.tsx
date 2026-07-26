import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import { useUploadLimits, formatFileSize } from '@/hooks/useFileUpload';
import api from '@/services/api';
import {
  filterMembers,
  findMentionQuery,
  preferredHandle,
  type MentionMember,
  type MentionQuery,
} from '@/utils/mentions';

interface CommentEditorProps {
  onSubmit: (content: string, files: File[]) => Promise<void>;
  onCancel?: () => void;
  initialContent?: string;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  showAttachments?: boolean;
  /** Enables @mention autocomplete against this project's members. */
  projectId?: string;
}

export function CommentEditor({
  onSubmit,
  onCancel,
  initialContent = '',
  placeholder = 'Write a comment...',
  submitLabel = 'Comment',
  autoFocus = false,
  showAttachments = false,
  projectId,
}: CommentEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [submitting, setSubmitting] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const { maxFileSizeMb, allowedMimeTypes } = useUploadLimits();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mentions are resolved server-side against project/workspace members, and an
  // ambiguous handle notifies nobody. Without a picker a user had to guess a
  // handle that happened to match — the feature worked but was unfindable.
  const [members, setMembers] = useState<MentionMember[]>([]);
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    api
      .get(`/projects/${projectId}/members`)
      .then(({ data }) => {
        if (active) setMembers(data.data ?? []);
      })
      .catch(() => {
        // Without the list the picker just never opens; typing a handle by
        // hand still works exactly as before.
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  const matches = mention ? filterMembers(members, mention.term).slice(0, 6) : [];

  const syncMention = (value: string, caret: number) => {
    const next = members.length > 0 ? findMentionQuery(value, caret) : null;
    setMention(next);
    setHighlighted(0);
  };

  const insertMention = (member: MentionMember) => {
    if (!mention) return;
    const handle = preferredHandle(member, members);
    const before = content.slice(0, mention.start);
    const after = content.slice(mention.start + 1 + mention.term.length);
    const inserted = `@${handle} `;

    setContent(`${before}${inserted}${after}`);
    setMention(null);

    // Put the caret after the inserted handle rather than at the end, so a
    // mention mid-sentence doesn't jump the user to the bottom.
    const caret = before.length + inserted.length;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

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
    // While the picker is open it owns the arrows, Enter/Tab and Escape —
    // otherwise Enter would submit the comment mid-mention and Escape would
    // discard the whole draft.
    if (mention && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(matches[highlighted]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention(null);
        return;
      }
    }

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
      <div className="relative">
        <textarea
          ref={textareaRef}
          className="w-full text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg p-3 outline-none focus:border-primary-500 resize-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
          rows={3}
          placeholder={placeholder}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            syncMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onClick={(e) => {
            const el = e.currentTarget;
            syncMention(el.value, el.selectionStart ?? el.value.length);
          }}
          onBlur={() => setMention(null)}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          disabled={submitting}
        />

        {/* The picker opens UPWARD: the comment editor sits at the bottom of
            the task detail panel, so a dropdown below the textarea is clipped
            off the viewport. Same choice as the sidebar's account menu. */}
        {mention && matches.length > 0 && (
          <ul
            role="listbox"
            aria-label="Mention a member"
            className="absolute bottom-full left-2 z-50 mb-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            {matches.map((member, i) => (
              <li key={member.id} role="option" aria-selected={i === highlighted}>
                <button
                  type="button"
                  // The picker closes on blur, so commit on mousedown —
                  // by the time click fires the query is already gone.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(member);
                  }}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                    i === highlighted
                      ? 'bg-gray-100 dark:bg-gray-700'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="truncate text-gray-700 dark:text-gray-300">
                    {member.name}
                  </span>
                  <span className="ml-auto truncate text-xs text-gray-400 dark:text-gray-500">
                    @{preferredHandle(member, members)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

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
