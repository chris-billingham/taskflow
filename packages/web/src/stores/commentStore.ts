import { create } from 'zustand';
import api from '@/services/api';

export interface CommentAuthor {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface Comment {
  id: string;
  content: string;
  authorId: string;
  taskId: string | null;
  projectId: string | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthor;
  replies: Comment[];
}

interface CommentState {
  comments: Map<string, Comment>;
  loading: boolean;
  error: string | null;
  version: number;

  fetchTaskComments: (taskId: string) => Promise<void>;
  createComment: (taskId: string, content: string, parentId?: string) => Promise<Comment>;
  updateComment: (id: string, content: string) => Promise<Comment>;
  deleteComment: (id: string) => Promise<void>;
  clearComments: () => void;
}

export const useCommentStore = create<CommentState>()((set, get) => ({
  comments: new Map(),
  loading: false,
  error: null,
  version: 0,

  fetchTaskComments: async (taskId) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get(`/tasks/${taskId}/comments`);
      const comments = new Map<string, Comment>();
      for (const c of data.data) {
        comments.set(c.id, c);
      }
      set({ comments, loading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.message || 'Failed to fetch comments',
        loading: false,
      });
    }
  },

  createComment: async (taskId, content, parentId) => {
    const { data } = await api.post(`/tasks/${taskId}/comments`, {
      content,
      parentId,
    });
    const comment = data.data as Comment;

    set((state) => {
      const comments = new Map(state.comments);
      if (parentId) {
        // Add reply to parent's replies array
        const parent = comments.get(parentId);
        if (parent) {
          comments.set(parentId, {
            ...parent,
            replies: [...parent.replies, comment],
          });
        }
      } else {
        comments.set(comment.id, comment);
      }
      return { comments, version: state.version + 1 };
    });

    return comment;
  },

  updateComment: async (id, content) => {
    const { data } = await api.patch(`/comments/${id}`, { content });
    const updated = data.data as Comment;

    set((state) => {
      const comments = new Map(state.comments);

      // Check if it's a top-level comment
      if (comments.has(id)) {
        comments.set(id, updated);
      } else {
        // It's a nested reply — find and update in parent's replies
        for (const [parentId, parent] of comments) {
          const replyIdx = parent.replies.findIndex((r) => r.id === id);
          if (replyIdx !== -1) {
            const newReplies = [...parent.replies];
            newReplies[replyIdx] = updated;
            comments.set(parentId, { ...parent, replies: newReplies });
            break;
          }
        }
      }

      return { comments, version: state.version + 1 };
    });

    return updated;
  },

  deleteComment: async (id) => {
    // Optimistic delete
    const prev = get().comments;
    const prevVersion = get().version;
    set((state) => {
      const comments = new Map(state.comments);

      // Check if it's a top-level comment
      if (comments.has(id)) {
        comments.delete(id);
      } else {
        // It's a nested reply — remove from parent's replies
        for (const [parentId, parent] of comments) {
          const replyIdx = parent.replies.findIndex((r) => r.id === id);
          if (replyIdx !== -1) {
            const newReplies = parent.replies.filter((r) => r.id !== id);
            comments.set(parentId, { ...parent, replies: newReplies });
            break;
          }
        }
      }

      return { comments, version: state.version + 1 };
    });

    try {
      await api.delete(`/comments/${id}`);
    } catch (err) {
      // Revert on failure
      set({ comments: prev, version: prevVersion });
      throw err;
    }
  },

  clearComments: () => {
    set({ comments: new Map(), loading: false, error: null });
  },
}));

// Selectors
export const selectCommentsArray = (state: CommentState) =>
  Array.from(state.comments.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
