import { useEffect, useCallback, useRef } from 'react';
import {
  useTaskStore,
  selectTasksByProject,
  selectTasksBySection,
  selectSubtasks,
} from '@/stores/taskStore';
import { useSocketStore } from '@/stores/socketStore';
import type { TaskQuery } from '@/stores/taskStore';

export function useTasks(query?: TaskQuery) {
  const tasks = useTaskStore((s) => {
    if (query?.projectId) {
      return selectTasksByProject(query.projectId)(s);
    }
    return Array.from(s.tasks.values())
      .filter((t) => !t.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  });
  const loading = useTaskStore((s) => s.loading);
  const error = useTaskStore((s) => s.error);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const loadMoreTasks = useTaskStore((s) => s.loadMoreTasks);
  const hasMore = useTaskStore((s) => s.tasksNextCursor !== null);
  const loadingMore = useTaskStore((s) => s.loadingMore);
  const resyncTasks = useTaskStore((s) => s.resyncTasks);
  const resyncEpoch = useSocketStore((s) => s.resyncEpoch);

  useEffect(() => {
    fetchTasks(query);
  }, [fetchTasks, query?.projectId, query?.sectionId, query?.completed]);

  // Read through a ref so the resync effect below depends on the epoch ALONE.
  // Listing the query fields there instead would fire a second, redundant fetch
  // alongside the mount effect above on every project switch.
  const queryRef = useRef(query);
  queryRef.current = query;

  // Reconcile once the socket is receiving broadcasts again — events missed
  // while it wasn't are never replayed. Epoch 0 is "no resync signal yet", so
  // this never duplicates the initial fetch.
  useEffect(() => {
    if (resyncEpoch === 0) return;
    void resyncTasks(queryRef.current);
  }, [resyncEpoch, resyncTasks]);

  return {
    tasks,
    loading,
    error,
    hasMore,
    loadingMore,
    loadMore: () => loadMoreTasks(query),
    refetch: () => fetchTasks(query),
  };
}

export function useTask(id: string | undefined) {
  const task = useTaskStore((s) => (id ? s.tasks.get(id) : undefined));
  const fetchTaskById = useTaskStore((s) => s.fetchTaskById);

  const refetch = useCallback(async () => {
    if (!id) return;
    return fetchTaskById(id);
  }, [id, fetchTaskById]);

  useEffect(() => {
    if (id && !task) {
      fetchTaskById(id);
    }
  }, [id, task, fetchTaskById]);

  return { task, refetch };
}

export function useTasksBySection(sectionId: string | null) {
  const tasks = useTaskStore(selectTasksBySection(sectionId));
  return tasks;
}

export function useSubtasks(parentId: string) {
  const subtasks = useTaskStore(selectSubtasks(parentId));
  return subtasks;
}

export function useCreateTask() {
  return useTaskStore((s) => s.createTask);
}

export function useUpdateTask() {
  return useTaskStore((s) => s.updateTask);
}

export function useDeleteTask() {
  return useTaskStore((s) => s.deleteTask);
}

export function useCompleteTask() {
  return useTaskStore((s) => s.completeTask);
}

export function useUncompleteTask() {
  return useTaskStore((s) => s.uncompleteTask);
}

export function useMoveTask() {
  return useTaskStore((s) => s.moveTask);
}

export function useDuplicateTask() {
  return useTaskStore((s) => s.duplicateTask);
}

export function useQuickAddTask() {
  return useTaskStore((s) => s.quickAddTask);
}

export function useReorderTasks() {
  return useTaskStore((s) => s.reorderTasks);
}

export function useTodayView() {
  const todayView = useTaskStore((s) => s.todayView);
  const loading = useTaskStore((s) => s.viewLoading);
  const error = useTaskStore((s) => s.error);
  const fetchTodayView = useTaskStore((s) => s.fetchTodayView);
  const rescheduleOverdue = useTaskStore((s) => s.rescheduleOverdue);
  const resyncEpoch = useSocketStore((s) => s.resyncEpoch);

  // The epoch is a dependency rather than a separate effect: this view has no
  // pagination to preserve, so re-running the ordinary fetch is the resync.
  useEffect(() => {
    fetchTodayView();
  }, [fetchTodayView, resyncEpoch]);

  return {
    todayView,
    loading,
    error,
    refetch: fetchTodayView,
    rescheduleOverdue,
  };
}

export function useUpcomingView(days: number = 14, includeNoDate: boolean = true) {
  const upcomingView = useTaskStore((s) => s.upcomingView);
  const loading = useTaskStore((s) => s.viewLoading);
  const error = useTaskStore((s) => s.error);
  const fetchUpcomingView = useTaskStore((s) => s.fetchUpcomingView);
  const resyncEpoch = useSocketStore((s) => s.resyncEpoch);

  useEffect(() => {
    fetchUpcomingView(days, includeNoDate);
  }, [fetchUpcomingView, days, includeNoDate, resyncEpoch]);

  return {
    upcomingView,
    loading,
    error,
    refetch: () => fetchUpcomingView(days, includeNoDate),
  };
}

export function useTaskActions() {
  const createTask = useTaskStore((s) => s.createTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const completeTask = useTaskStore((s) => s.completeTask);
  const uncompleteTask = useTaskStore((s) => s.uncompleteTask);
  const moveTask = useTaskStore((s) => s.moveTask);
  const duplicateTask = useTaskStore((s) => s.duplicateTask);
  const quickAddTask = useTaskStore((s) => s.quickAddTask);
  const reorderTasks = useTaskStore((s) => s.reorderTasks);
  const rescheduleTask = useTaskStore((s) => s.rescheduleTask);

  return {
    createTask,
    updateTask,
    deleteTask,
    completeTask,
    uncompleteTask,
    moveTask,
    duplicateTask,
    quickAddTask,
    reorderTasks,
    rescheduleTask,
  };
}
