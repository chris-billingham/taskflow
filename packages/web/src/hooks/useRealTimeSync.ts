import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useSocketStore } from '@/stores/socketStore';
import { getSocket } from '@/services/socket';
import { useQueryClient } from '@tanstack/react-query';
import type { Task } from '@/types/task';
import { taskKeys } from '@/queries/taskKeys';
import { mergeTask, patchTaskCaches } from '@/queries/taskCache';
import type { Project, ProjectSection } from '@/types/project';
import { patchCachedProject, projectKeys } from '@/queries/projects';
import { removeComment, updateCachedComments, upsertComment, type Comment } from '@/queries/comments';
import { activityKeys } from '@/queries/activity';

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
      patchCachedProject(qc, project.id, (cached) => ({ ...cached, ...project }));
      // New projects have no event of their own; a refetch picks them up.
      void qc.invalidateQueries({ queryKey: projectKeys.list() });
    };

    // A project was shared with you, or you lost it: which projects and
    // tasks you can see has changed.
    const onAccessChanged = () => {
      void qc.invalidateQueries({ queryKey: projectKeys.all });
      void qc.invalidateQueries({ queryKey: taskKeys.all });
    };

    const onProjectDeleted = ({ projectId }: { projectId: string }) => {
      patchCachedProject(qc, projectId, () => null);
      scheduleRefresh();
    };

    // Sections live on the project payloads; re-read that project.
    const onSectionChanged = ({ section }: { section: ProjectSection }) => {
      void qc.invalidateQueries({ queryKey: projectKeys.detail(section.projectId) });
      void qc.invalidateQueries({ queryKey: projectKeys.list() });
    };

    const onSectionDeleted = ({ projectId }: { sectionId: string; projectId: string }) => {
      void qc.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
      void qc.invalidateQueries({ queryKey: projectKeys.list() });
      scheduleRefresh();
    };

    // Comments for tasks nobody has open aren't cached, so these are no-ops
    // unless that task's panel has loaded its comments.
    const onCommentChanged = ({ comment }: { comment: Comment }) => {
      if (!comment.taskId) return;
      updateCachedComments(qc, comment.taskId, upsertComment(comment));
      void qc.invalidateQueries({ queryKey: activityKeys.task(comment.taskId) });
    };

    const onCommentDeleted = ({ commentId, taskId }: { commentId: string; taskId: string | null }) => {
      if (!taskId) return;
      updateCachedComments(qc, taskId, removeComment(commentId));
    };

    socket.on('task:created', onTaskCreated);
    socket.on('task:updated', onTaskUpdated);
    socket.on('task:deleted', onTaskDeleted);
    socket.on('task:completed', onTaskUpdated);
    socket.on('project:updated', onProjectUpdated);
    socket.on('project:deleted', onProjectDeleted);
    socket.on('project:shared', onAccessChanged);
    socket.on('project:unshared', onAccessChanged);
    socket.on('section:created', onSectionChanged);
    socket.on('section:updated', onSectionChanged);
    socket.on('section:deleted', onSectionDeleted);
    socket.on('comment:created', onCommentChanged);
    socket.on('comment:updated', onCommentChanged);
    socket.on('comment:deleted', onCommentDeleted);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.off('task:created', onTaskCreated);
      socket.off('task:updated', onTaskUpdated);
      socket.off('task:deleted', onTaskDeleted);
      socket.off('task:completed', onTaskUpdated);
      socket.off('project:updated', onProjectUpdated);
      socket.off('project:deleted', onProjectDeleted);
      socket.off('project:shared', onAccessChanged);
      socket.off('project:unshared', onAccessChanged);
      socket.off('section:created', onSectionChanged);
      socket.off('section:updated', onSectionChanged);
      socket.off('section:deleted', onSectionDeleted);
      socket.off('comment:created', onCommentChanged);
      socket.off('comment:updated', onCommentChanged);
      socket.off('comment:deleted', onCommentDeleted);
    };
  }, [isAuthenticated, isLoading, status, qc]);
}
