import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useSocketStore } from '@/stores/socketStore';
import { getSocket } from '@/services/socket';
import { useQueryClient } from '@tanstack/react-query';
import type { Task } from '@/types/task';
import { taskKeys } from '@/queries/taskKeys';
import { mergeTask, patchTaskCaches } from '@/queries/taskCache';
import { useProjectStore, type Project, type ProjectSection } from '@/stores/projectStore';
import { useCommentStore, type Comment } from '@/stores/commentStore';

export function useRealTimeSync(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const status = useSocketStore((s) => s.status);
  const resyncEpoch = useSocketStore((s) => s.resyncEpoch);
  const qc = useQueryClient();

  // Events missed while the socket was away are never replayed, so after
  // every (re)connect re-read whatever is cached. Active queries refetch at
  // once (paged lists keep their depth); the rest refetch when next shown.
  // Epoch 0 is "no resync yet", so this never duplicates a first load.
  useEffect(() => {
    if (resyncEpoch === 0) return;
    void qc.invalidateQueries();
  }, [resyncEpoch, qc]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    const socket = getSocket();
    if (!socket) return;

    // A remote change is applied to every cached copy at once, then the task
    // queries are refetched so each view's membership is right (a new due
    // date moves a task between Today and Upcoming; a new task belongs
    // somewhere we can't work out locally). Debounced so a burst of events
    // (bulk edits, reconnect catch-up) costs one round of refetches.
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void qc.invalidateQueries({ queryKey: taskKeys.all });
      }, 500);
    };

    const onTaskCreated = () => {
      scheduleRefresh();
    };

    const onTaskUpdated = ({ task }: { task: Task }) => {
      patchTaskCaches(qc, (cached) => (cached.id === task.id ? mergeTask(cached, task) : cached));
      scheduleRefresh();
    };

    const onTaskDeleted = ({ taskId }: { taskId: string }) => {
      patchTaskCaches(qc, (cached) => (cached.id === taskId ? null : cached));
      scheduleRefresh();
    };

    const onProjectUpdated = ({ project }: { project: Project }) => {
      useProjectStore.getState().setProject(project);
    };

    const onProjectDeleted = ({ projectId }: { projectId: string }) => {
      useProjectStore.getState().removeProject(projectId);
    };

    const onSectionCreated = ({ section }: { section: ProjectSection }) => {
      const projectState = useProjectStore.getState();
      const project = projectState.projects.get(section.projectId);
      if (!project) return;
      const sections = [...(project.sections ?? []), section].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      projectState.setProject({ ...project, sections });
    };

    const onSectionUpdated = ({ section }: { section: ProjectSection }) => {
      const projectState = useProjectStore.getState();
      const project = projectState.projects.get(section.projectId);
      if (!project) return;
      const sections = (project.sections ?? []).map((s) =>
        s.id === section.id ? section : s,
      );
      projectState.setProject({ ...project, sections });
    };

    const onSectionDeleted = ({
      sectionId,
      projectId,
    }: {
      sectionId: string;
      projectId: string;
    }) => {
      const projectState = useProjectStore.getState();
      const project = projectState.projects.get(projectId);
      if (!project) return;
      const sections = (project.sections ?? []).filter((s) => s.id !== sectionId);
      projectState.setProject({ ...project, sections });
    };

    const onCommentCreated = ({ comment }: { comment: Comment }) => {
      const state = useCommentStore.getState();
      if (!comment.taskId || state.currentTaskId !== comment.taskId) return;
      const comments = new Map(state.comments);
      if (comment.parentId) {
        const parent = comments.get(comment.parentId);
        if (parent && !parent.replies.some((r) => r.id === comment.id)) {
          comments.set(comment.parentId, {
            ...parent,
            replies: [...parent.replies, comment],
          });
        }
      } else if (!comments.has(comment.id)) {
        comments.set(comment.id, comment);
      }
      state.setComments(comments);
    };

    const onCommentUpdated = ({ comment }: { comment: Comment }) => {
      const state = useCommentStore.getState();
      if (!comment.taskId || state.currentTaskId !== comment.taskId) return;
      const comments = new Map(state.comments);
      if (comments.has(comment.id)) {
        comments.set(comment.id, comment);
      } else {
        for (const [parentId, parent] of comments) {
          const idx = parent.replies.findIndex((r) => r.id === comment.id);
          if (idx !== -1) {
            const replies = [...parent.replies];
            replies[idx] = comment;
            comments.set(parentId, { ...parent, replies });
            break;
          }
        }
      }
      state.setComments(comments);
    };

    const onCommentDeleted = ({
      commentId,
      taskId,
    }: {
      commentId: string;
      taskId: string | null;
    }) => {
      const state = useCommentStore.getState();
      if (!taskId || state.currentTaskId !== taskId) return;
      const comments = new Map(state.comments);
      if (comments.has(commentId)) {
        comments.delete(commentId);
      } else {
        for (const [parentId, parent] of comments) {
          const idx = parent.replies.findIndex((r) => r.id === commentId);
          if (idx !== -1) {
            comments.set(parentId, {
              ...parent,
              replies: parent.replies.filter((r) => r.id !== commentId),
            });
            break;
          }
        }
      }
      state.setComments(comments);
    };

    socket.on('task:created', onTaskCreated);
    socket.on('task:updated', onTaskUpdated);
    socket.on('task:deleted', onTaskDeleted);
    socket.on('task:completed', onTaskUpdated);
    socket.on('project:updated', onProjectUpdated);
    socket.on('project:deleted', onProjectDeleted);
    socket.on('section:created', onSectionCreated);
    socket.on('section:updated', onSectionUpdated);
    socket.on('section:deleted', onSectionDeleted);
    socket.on('comment:created', onCommentCreated);
    socket.on('comment:updated', onCommentUpdated);
    socket.on('comment:deleted', onCommentDeleted);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.off('task:created', onTaskCreated);
      socket.off('task:updated', onTaskUpdated);
      socket.off('task:deleted', onTaskDeleted);
      socket.off('task:completed', onTaskUpdated);
      socket.off('project:updated', onProjectUpdated);
      socket.off('project:deleted', onProjectDeleted);
      socket.off('section:created', onSectionCreated);
      socket.off('section:updated', onSectionUpdated);
      socket.off('section:deleted', onSectionDeleted);
      socket.off('comment:created', onCommentCreated);
      socket.off('comment:updated', onCommentUpdated);
      socket.off('comment:deleted', onCommentDeleted);
    };
  }, [isAuthenticated, isLoading, status, qc]);
}
