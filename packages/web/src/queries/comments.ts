import { useMemo } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type { Comment } from '@taskflow/contract';
import { reportMutationError } from '@/utils/reportError';
import { errorMessage } from './tasks';
import { activityKeys } from './activity';

export type { Comment };
export type CommentAuthor = Comment['author'];

export const commentKeys = {
  all: ['comments'] as const,
  task: (taskId: string) => ['comments', taskId] as const,
};

type Reply = Comment['replies'][number];

/** Apply a change to a task's cached comments (top level and one level of replies). */
export function updateCachedComments(
  qc: QueryClient,
  taskId: string,
  fn: (comments: Comment[]) => Comment[],
): void {
  qc.setQueryData<Comment[]>(commentKeys.task(taskId), (list) => (list ? fn(list) : list));
}

/** Insert or replace a comment (or a reply under its parent). */
export const upsertComment =
  (comment: Comment | Reply) =>
  (list: Comment[]): Comment[] => {
    if (comment.parentId) {
      return list.map((c) => {
        if (c.id !== comment.parentId) return c;
        const exists = c.replies.some((r) => r.id === comment.id);
        return {
          ...c,
          replies: exists
            ? c.replies.map((r) => (r.id === comment.id ? (comment as Reply) : r))
            : [...c.replies, comment as Reply],
        };
      });
    }
    const exists = list.some((c) => c.id === comment.id);
    return exists
      ? list.map((c) => (c.id === comment.id ? { ...(comment as Comment), replies: c.replies } : c))
      : [comment as Comment, ...list];
  };

export const removeComment =
  (id: string) =>
  (list: Comment[]): Comment[] =>
    list
      .filter((c) => c.id !== id)
      .map((c) => (c.replies.some((r) => r.id === id) ? { ...c, replies: c.replies.filter((r) => r.id !== id) } : c));

/** A task's comments, newest first, each with its replies. */
export function useComments(taskId: string) {
  const query = useQuery({
    queryKey: commentKeys.task(taskId),
    queryFn: async () => (await api.get(`/tasks/${taskId}/comments`)).data.data as Comment[],
  });
  const comments = useMemo(
    () =>
      [...(query.data ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [query.data],
  );
  return {
    comments,
    loading: query.isLoading,
    error: errorMessage(query.error, 'Failed to load comments'),
  };
}

export function useCommentActions(taskId: string) {
  const qc = useQueryClient();
  return useMemo(() => {
    const settle = () => {
      void qc.invalidateQueries({ queryKey: commentKeys.task(taskId) });
      void qc.invalidateQueries({ queryKey: activityKeys.task(taskId) });
    };
    return {
      createComment: async (content: string, parentId?: string) => {
        try {
          const comment = (await api.post(`/tasks/${taskId}/comments`, { content, parentId })).data
            .data as Comment;
          updateCachedComments(qc, taskId, upsertComment(comment));
          return comment;
        } finally {
          settle();
        }
      },
      updateComment: async (id: string, content: string) => {
        try {
          const comment = (await api.patch(`/comments/${id}`, { content })).data.data as Comment;
          updateCachedComments(qc, taskId, upsertComment(comment));
          return comment;
        } catch (err) {
          reportMutationError(err, 'The comment could not be saved');
          throw err;
        } finally {
          settle();
        }
      },
      deleteComment: async (id: string) => {
        const previous = qc.getQueryData<Comment[]>(commentKeys.task(taskId));
        updateCachedComments(qc, taskId, removeComment(id));
        try {
          await api.delete(`/comments/${id}`);
        } catch (err) {
          qc.setQueryData(commentKeys.task(taskId), previous);
          reportMutationError(err, 'The comment could not be deleted');
          throw err;
        } finally {
          settle();
        }
      },
    };
  }, [qc, taskId]);
}
