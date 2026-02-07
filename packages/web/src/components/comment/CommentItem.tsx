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
  onReply?: (content: string) => Promise<void>;
  isReply?: boolean;
}

export function CommentItem({
  comment,
  currentUserId,
  onEdit,
  onDelete,
  onReply,
  isReply = false,
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
          initialContent={comment.content}
          onSubmit={async (content) => {
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
            <span className="text-xs font-medium text-gray-900">
              {comment.author.name}
            </span>
            <span className="text-[11px] text-gray-400">
              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
            </span>
            {isEdited && (
              <span className="text-[11px] text-gray-400 italic">(edited)</span>
            )}
          </div>

          {/* Content */}
          <div className="prose prose-sm max-w-none text-gray-700 text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown>{comment.content}</ReactMarkdown>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-1">
            {!isReply && onReply && (
              <button
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600"
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
              className="p-1 rounded hover:bg-gray-100"
              onClick={() => setShowMenu(!showMenu)}
              onBlur={() => setTimeout(() => setShowMenu(false), 150)}
            >
              <MoreHorizontal className="w-4 h-4 text-gray-400" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-7 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-[120px]">
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    setEditing(true);
                    setShowMenu(false);
                  }}
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
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
            onSubmit={async (content) => {
              await onReply(content);
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
              isReply
            />
          ))}
        </div>
      )}
    </div>
  );
}
