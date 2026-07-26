import { useState } from 'react';
import { MoreHorizontal, Pencil, Trash2, Reply } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import type { Comment } from '@/stores/commentStore';
import { CommentEditor } from './CommentEditor';

interface CommentItemProps {
  comment: Comment;
  currentUserId: string;
  onEdit: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReply?: (content: string, files: File[]) => Promise<void>;
  isReply?: boolean;
  projectId?: string;
}

export function CommentItem({
  comment,
  currentUserId,
  onEdit,
  onDelete,
  onReply,
  isReply = false,
  projectId,
}: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const isOwn = comment.authorId === currentUserId;
  const isEdited = comment.createdAt !== comment.updatedAt;

  const initial = comment.author.name
    ? comment.author.name.charAt(0).toUpperCase()
    : '?';

  if (editing) {
    return (
      <div className={isReply ? 'ml-8' : ''}>
        <CommentEditor
          projectId={projectId}
          initialContent={comment.content}
          onSubmit={async (content, _files) => {
            await onEdit(comment.id, content);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          submitLabel="Save"
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className={`group ${isReply ? 'ml-8' : ''}`}>
      <div className="flex gap-2">
        {/* Avatar */}
        {comment.author.avatarUrl ? (
          <img
            src={comment.author.avatarUrl}
            alt={comment.author.name}
            className="w-7 h-7 rounded-full flex-shrink-0"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-medium flex-shrink-0">
            {initial}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-medium text-gray-900 dark:text-white">
              {comment.author.name}
            </span>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
            </span>
            {isEdited && (
              <span className="text-[11px] text-gray-400 dark:text-gray-500 italic">(edited)</span>
            )}
          </div>

          {/* Content */}
          <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300 text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown>{comment.content}</ReactMarkdown>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-1">
            {!isReply && onReply && (
              <button
                className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                onClick={() => setReplying(true)}
              >
                <Reply className="w-3 h-3" />
                Reply
              </button>
            )}
          </div>
        </div>

        {/* Menu */}
        {isOwn && (
          <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setShowMenu(!showMenu)}
              onBlur={() => setTimeout(() => setShowMenu(false), 150)}
            >
              <MoreHorizontal className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-7 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-10 min-w-[120px]">
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  onClick={() => {
                    setEditing(true);
                    setShowMenu(false);
                  }}
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  onClick={() => {
                    onDelete(comment.id);
                    setShowMenu(false);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reply editor */}
      {replying && onReply && (
        <div className="ml-9 mt-2">
          <CommentEditor
          projectId={projectId}
            onSubmit={async (content, _files) => {
              await onReply(content, _files);
              setReplying(false);
            }}
            onCancel={() => setReplying(false)}
            placeholder="Write a reply..."
            submitLabel="Reply"
            autoFocus
          />
        </div>
      )}

      {/* Nested replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-2 space-y-2">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              onEdit={onEdit}
              onDelete={onDelete}
              onReply={onReply}
              projectId={projectId}
              isReply
            />
          ))}
        </div>
      )}
    </div>
  );
}
