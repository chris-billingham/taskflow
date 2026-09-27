import { useMemo } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { reportMutationError } from '@/utils/reportError';
import type { CreateTaskInput, MoveTaskInput, QuickAddDue, Task } from '@/types/task';
import { taskKeys } from './taskKeys';
import { activityKeys } from './activity';
import { mergeTask, patchTaskCaches, snapshotTaskCaches, type TaskMapper } from './taskCache';

// Task mutations in flight, per client. Caches are refetched only when the
// last one settles: refetching while another change is still on its way to
// the server would briefly show the old value over its optimistic one.
const inFlight = new WeakMap<QueryClient, number>();

const only = (id: string, fn: (task: Task) => Task | null): TaskMapper =>
  (task) => (task.id === id ? fn(task) : task);

function createTaskActions(qc: QueryClient) {
  /**
   * Run a task change: apply it to every cached copy at once, send it, then
   * reconcile. On failure the caches roll back and the user is told. When the
   * last in-flight change settles, the task queries refetch so each view's
   * membership (what now belongs in Today, which section) is right.
   */
  async function run<T>(options: {
    optimistic?: TaskMapper;
    request: () => Promise<T>;
    onSuccess?: (result: T) => void;
    failure: string;
  }): Promise<T> {
    inFlight.set(qc, (inFlight.get(qc) ?? 0) + 1);
    try {
      await qc.cancelQueries({ queryKey: taskKeys.all });
      const snapshot = snapshotTaskCaches(qc);
      if (options.optimistic) patchTaskCaches(qc, options.optimistic);
      try {
        const result = await options.request();
        options.onSuccess?.(result);
        return result;
      } catch (err) {
        for (const [key, data] of snapshot) qc.setQueryData(key, data);
        reportMutationError(err, options.failure);
        throw err;
      }
    } finally {
      const remaining = (inFlight.get(qc) ?? 1) - 1;
      inFlight.set(qc, remaining);
      if (remaining === 0) {
        void qc.invalidateQueries({ queryKey: taskKeys.all });
        void qc.invalidateQueries({ queryKey: activityKeys.all });
      }
    }
  }

  const reconcile = (id: string) => (server: Task) =>
    patchTaskCaches(qc, only(id, (task) => mergeTask(task, server)));

  const updateTask = (id: string, input: Record<string, unknown>) =>
    run({
      optimistic: only(id, (task) => ({ ...task, ...input }) as Task),
      request: async () => (await api.patch(`/tasks/${id}`, input)).data.data as Task,
      onSuccess: reconcile(id),
      failure: 'That change could not be saved',
    });

  return {
    createTask: (input: CreateTaskInput) =>
      run({
        request: async () => (await api.post('/tasks', input)).data.data as Task,
        failure: 'The task could not be added',
      }),

    quickAddTask: (text: string, projectId?: string, due?: QuickAddDue) =>
      run({
        request: async () =>
          (await api.post('/tasks/quick-add', { text, projectId, ...due })).data.data as Task,
        failure: 'The task could not be added',
      }),

    updateTask,

    rescheduleTask: (id: string, dueDate: string) => updateTask(id, { dueDate }),

    deleteTask: (id: string) =>
      run({
        optimistic: only(id, () => null),
        request: async () => {
          await api.delete(`/tasks/${id}`);
        },
        failure: 'The task could not be deleted',
      }),

    completeTask: (id: string) =>
      run({
        optimistic: only(id, (task) => ({
          ...task,
          isCompleted: true,
          completedAt: new Date().toISOString(),
        })),
        request: async () => (await api.post(`/tasks/${id}/complete`)).data.data as Task,
        // A recurring task answers with its next occurrence; the refetch that
        // follows brings that in, and the completed one stays completed.
        onSuccess: (server) => {
          if (server.id === id) reconcile(id)(server);
        },
        failure: 'The task could not be completed',
      }),

    uncompleteTask: (id: string) =>
      run({
        optimistic: only(id, (task) => ({ ...task, isCompleted: false, completedAt: null })),
        request: async () => (await api.post(`/tasks/${id}/uncomplete`)).data.data as Task,
        onSuccess: reconcile(id),
        failure: 'That change could not be saved',
      }),

    moveTask: (id: string, input: MoveTaskInput) =>
      run({
        optimistic: only(id, (task) => ({ ...task, ...input }) as Task),
        request: async () => (await api.post(`/tasks/${id}/move`, input)).data.data as Task,
        onSuccess: reconcile(id),
        failure: 'The task could not be moved',
      }),

    duplicateTask: (id: string) =>
      run({
        request: async () => (await api.post(`/tasks/${id}/duplicate`)).data.data as Task,
        failure: 'The task could not be duplicated',
      }),

    reorderTasks: (taskIds: string[]) => {
      const order = new Map(taskIds.map((id, index) => [id, index]));
      return run({
        optimistic: (task) =>
          order.has(task.id) ? { ...task, sortOrder: order.get(task.id)! } : task,
        request: async () => {
          await api.put('/tasks/reorder', { taskIds });
        },
        failure: 'The new order could not be saved',
      });
    },

    bulkUpdate: (taskIds: string[], action: string, data?: Record<string, unknown>) =>
      run({
        request: async () => {
          await api.post('/tasks/bulk', { taskIds, action, data });
        },
        failure: 'Those tasks could not be updated',
      }),

    rescheduleOverdue: (targetDate: string) =>
      run({
        request: async () => {
          await api.post('/views/reschedule-overdue', { targetDate });
        },
        failure: 'Overdue tasks could not be rescheduled',
      }),
  };
}

export type TaskActions = ReturnType<typeof createTaskActions>;

/**
 * Every task change the UI can make, shared by every page and row. Each one
 * updates all cached copies of the task immediately and reconciles with the
 * server afterwards, so pages don't need to refetch after acting.
 */
export function useTaskActions(): TaskActions {
  const qc = useQueryClient();
  return useMemo(() => createTaskActions(qc), [qc]);
}
