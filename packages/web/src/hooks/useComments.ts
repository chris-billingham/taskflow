import { useEffect } from 'react';
import { useCommentStore, selectCommentsArray } from '@/stores/commentStore';

export function useComments(taskId: string) {
  const comments = useCommentStore(selectCommentsArray);
  const loading = useCommentStore((s) => s.loading);
  const error = useCommentStore((s) => s.error);
  const fetchTaskComments = useCommentStore((s) => s.fetchTaskComments);
  const clearComments = useCommentStore((s) => s.clearComments);

  useEffect(() => {
    fetchTaskComments(taskId);
    return () => clearComments();
  }, [taskId, fetchTaskComments, clearComments]);

  return { comments, loading, error, refetch: () => fetchTaskComments(taskId) };
}

export function useCreateComment() {
  return useCommentStore((s) => s.createComment);
}

export function useUpdateComment() {
  return useCommentStore((s) => s.updateComment);
}

export function useDeleteComment() {
  return useCommentStore((s) => s.deleteComment);
}
