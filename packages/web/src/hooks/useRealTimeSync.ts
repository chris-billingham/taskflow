import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useSocketStore } from '@/stores/socketStore';
import { getSocket } from '@/services/socket';
import { useTaskStore, type Task } from '@/stores/taskStore';
import { useProjectStore, type Project, type ProjectSection } from '@/stores/projectStore';
import { useCommentStore, type Comment } from '@/stores/commentStore';

export function useRealTimeSync(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const status = useSocketStore((s) => s.status);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    const socket = getSocket();
    if (!socket) return;

    // The Today/Upcoming pages render from snapshot arrays (todayView /
    // upcomingView), not the live task map, so a remote change needs a view
    // refetch to become visible. Debounced so a burst of events (bulk edits,
    // reconnect catch-up) costs one round trip. Refresh only views that are
    // already loaded.
    let viewRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleViewRefresh = () => {
      if (viewRefreshTimer) return;
      viewRefreshTimer = setTimeout(() => {
        viewRefreshTimer = null;
        const taskState = useTaskStore.getState();
        if (taskState.todayView) void taskState.fetchTodayView();
        if (taskState.upcomingView) void taskState.fetchUpcomingView();
      }, 500);
    };

    const onTaskCreated = ({ task }: { task: Task }) => {
      useTaskStore.getState().setTask(task);
      scheduleViewRefresh();
    };

    const onTaskUpdated = ({ task }: { task: Task }) => {
      useTaskStore.getState().setTask(task);
      scheduleViewRefresh();
    };

    const onTaskDeleted = ({ taskId }: { taskId: string }) => {
      useTaskStore.getState().removeTask(taskId);
      scheduleViewRefresh();
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
      if (viewRefreshTimer) clearTimeout(viewRefreshTimer);
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
  }, [isAuthenticated, isLoading, status]);
}
