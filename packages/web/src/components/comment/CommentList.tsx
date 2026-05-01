import { MessageSquare, Loader2, AlertCircle } from 'lucide-react';
import { useComments, useCreateComment, useUpdateComment, useDeleteComment } from '@/hooks/useComments';
import { useAuthStore } from '@/stores/authStore';
import { CommentEditor } from './CommentEditor';
import { CommentItem } from './CommentItem';
import api from '@/services/api';

interface CommentListProps {
  taskId: string;
}

export function CommentList({ taskId }: CommentListProps) {
  const { comments, loading, error } = useComments(taskId);
  const createComment = useCreateComment();
  const updateComment = useUpdateComment();
  const deleteComment = useDeleteComment();
  const user = useAuthStore((s) => s.user);

  if (!user) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1">
        <MessageSquare className="w-4 h-4" />
        Comments
        {comments.length > 0 && (
          <span className="text-xs text-gray-400 font-normal">
            ({comments.length})
          </span>
        )}
      </h3>

      {/* New comment editor */}
      <div className="mb-4">
        <CommentEditor
          onSubmit={async (content, files) => {
            const comment = await createComment(taskId, content);
            if (files.length > 0) {
              await Promise.all(
                files.map((file) => {
                  const formData = new FormData();
                  formData.append('file', file);
                  return api.post(`/comments/${comment.id}/attachments`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                  });
                }),
              );
            }
          }}
          showAttachments
        />
      </div>

      {/* Loading state */}
      {loading && comments.length === 0 && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 py-3 text-xs text-red-500">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && comments.length === 0 && (
        <p className="text-xs text-gray-400 italic py-2">
          No comments yet. Be the first to comment.
        </p>
      )}

      {/* Comments list */}
      {comments.length > 0 && (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={user.id}
              onEdit={async (id, content) => {
                await updateComment(id, content);
              }}
              onDelete={async (id) => {
                await deleteComment(id);
              }}
              onReply={async (content, _files) => {
                await createComment(taskId, content, comment.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
