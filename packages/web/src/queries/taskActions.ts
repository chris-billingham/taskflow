import { useMemo } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { reportMutationError } from '@/utils/reportError';
import { toastUndo } from '@/stores/toastStore';
import type { CreateTaskInput, MoveTaskInput, QuickAddContext, Task } from '@/types/task';
import { taskKeys } from './taskKeys';
import { activityKeys } from './activity';
import { projectKeys } from './projects';
import type { Project } from '@/types/project';
import { findCachedTask, mergeTask, patchTaskCaches, snapshotTaskCaches, type TaskMapper } from './taskCache';
import { enqueue, isNetworkError, type OutboxEntry } from './outbox';

export type BulkAction =
  | 'complete'
  | 'uncomplete'
  | 'delete'
  | 'restore'
  | 'move'
  | 'updatePriority'
  | 'setDueDate'
  | 'addLabels'
  | 'removeLabels';

export interface BulkData {
  projectId?: string;
  sectionId?: string | null;
  priority?: number;
  dueDate?: string | null;
  labelIds?: string[];
}

/** Where a task sat before a move, so Undo can put it back. */
export interface MoveOrigin {
  projectId: string;
  sectionId: string | null;
  parentId?: string | null;
}

/** Pass `{ undo: false }` when the action is itself an undo, or is one of many. */
export interface ActionOptions {
  undo?: boolean;
}

export const trashKeys = { all: ['trash'] as const };

// Task mutations in flight, per client. Caches are refetched only when the
// last one settles: refetching while another change is still on its way to
// the server would briefly show the old value over its optimistic one.
const inFlight = new WeakMap<QueryClient, number>();

const only = (id: string, fn: (task: Task) => Task | null): TaskMapper =>
  (task) => (task.id === id ? fn(task) : task);

/**
 * The server bumps a task's version on every change. Doing the same to the
 * cached copy keeps the next edit's `ifVersion` right when changes queue up
 * offline (otherwise a second offline edit to a task looked like someone
 * else's change); online, the server's reply replaces it anyway.
 */
const bumped = (task: Task): Task => ({ ...task, version: (task.version ?? 0) + 1 });

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
    /**
     * How to send this change later if there's no connection: it stays on
     * screen and is queued (see outbox.ts). Changes without it fail offline.
     */
    queue?: Omit<OutboxEntry, 'id' | 'queuedAt'>;
  }): Promise<T | undefined> {
    inFlight.set(qc, (inFlight.get(qc) ?? 0) + 1);
    let queued = false;
    const queueIt = async () => {
      await enqueue(options.queue!);
      queued = true;
      return undefined;
    };
    try {
      await qc.cancelQueries({ queryKey: taskKeys.all });
      const snapshot = snapshotTaskCaches(qc);
      if (options.optimistic) patchTaskCaches(qc, options.optimistic);
      if (options.queue && !navigator.onLine) return await queueIt();
      try {
        const result = await options.request();
        options.onSuccess?.(result);
        return result;
      } catch (err) {
        if (options.queue && isNetworkError(err)) return await queueIt();
        for (const [key, data] of snapshot) qc.setQueryData(key, data);
        reportMutationError(err, options.failure);
        throw err;
      }
    } finally {
      const remaining = (inFlight.get(qc) ?? 1) - 1;
      inFlight.set(qc, remaining);
      // A queued change isn't on the server yet: refetching would show the
      // old value over it until the queue is sent.
      if (remaining === 0 && !queued) {
        void qc.invalidateQueries({ queryKey: taskKeys.all });
        void qc.invalidateQueries({ queryKey: activityKeys.all });
        void qc.invalidateQueries({ queryKey: trashKeys.all });
      }
    }
  }

  const reconcile = (id: string) => (server: Task) =>
    patchTaskCaches(qc, only(id, (task) => mergeTask(task, server)));

  /** "“Buy milk”", for messages about a queued change. */
  const named = (id: string) => {
    const content = findCachedTask(qc, id)?.content;
    return content ? `“${content}”` : 'A task';
  };

  const uncompleteTask = (id: string) =>
    run({
      optimistic: only(id, (task) => bumped({ ...task, isCompleted: false, completedAt: null })),
      request: async () => (await api.post(`/tasks/${id}/uncomplete`)).data.data as Task,
      onSuccess: reconcile(id),
      failure: 'That change could not be saved',
      queue: { method: 'post', url: `/tasks/${id}/uncomplete`, label: `Reopening ${named(id)}`, taskId: id },
    });

  const restoreTask = (id: string) =>
    run({
      request: async () => (await api.post(`/tasks/${id}/restore`)).data.data as Task,
      failure: 'The task could not be restored',
    });

  /** To the trash, with an Undo that restores it. */
  const deleteTask = async (id: string, options: ActionOptions = {}) => {
    const deleted = await run({
      optimistic: only(id, () => null),
      request: async () => {
        await api.delete(`/tasks/${id}`);
        return true;
      },
      failure: 'The task could not be deleted',
      queue: { method: 'delete', url: `/tasks/${id}`, label: `Deleting ${named(id)}` },
    });
    // Undo needs the server; a deletion queued offline has none yet.
    if (deleted && options.undo !== false) toastUndo('Task moved to trash', () => void restoreTask(id));
  };

  /** "Work", "Work / Next week" or "No section", for the move toast. */
  const destinationName = (input: MoveTaskInput, before: MoveOrigin) => {
    const projectId = input.projectId ?? before.projectId;
    const project = qc.getQueryData<Project[]>(projectKeys.list())?.find((p) => p.id === projectId);
    const section = input.sectionId ? project?.sections?.find((s) => s.id === input.sectionId) : null;
    const projectName = project ? (project.isInbox ? 'Inbox' : project.name) : 'another project';
    if (section) return `${projectName} / ${section.name}`;
    return projectId === before.projectId ? `${projectName} (no section)` : projectName;
  };

  const moveTask = async (
    id: string,
    input: MoveTaskInput,
    options: ActionOptions & { from?: MoveOrigin } = {},
  ) => {
    // Where it was, for Undo: from the caller, or any cached copy.
    const before: MoveOrigin | undefined = options.from ?? findCachedTask(qc, id);
    const moved = await run({
      optimistic: only(id, (task) => ({ ...task, ...input }) as Task),
      request: async () => (await api.post(`/tasks/${id}/move`, input)).data.data as Task,
      onSuccess: reconcile(id),
      failure: 'The task could not be moved',
    });
    if (options.undo !== false && before) {
      toastUndo(`Moved to ${destinationName(input, before)}`, () =>
        void moveTask(
          id,
          { projectId: before.projectId, sectionId: before.sectionId, parentId: before.parentId ?? null },
          { undo: false },
        ),
      );
    }
    return moved;
  };

  /**
   * One action on many tasks (POST /tasks/bulk), applied optimistically to
   * every cached copy like the single-task actions.
   */
  const bulkUpdate = (taskIds: string[], action: BulkAction, data: BulkData = {}) => {
    const selected = new Set(taskIds);
    const optimistic: Partial<Record<BulkAction, (task: Task) => Task | null>> = {
      complete: (t) => ({ ...t, isCompleted: true, completedAt: new Date().toISOString() }),
      uncomplete: (t) => ({ ...t, isCompleted: false, completedAt: null }),
      delete: () => null,
      updatePriority: (t) => ({ ...t, priority: data.priority ?? t.priority }),
      setDueDate: (t) =>
        data.dueDate ? { ...t, dueDate: data.dueDate } : { ...t, dueDate: null, dueTime: null },
      move: (t) => ({
        ...t,
        projectId: data.projectId ?? t.projectId,
        sectionId: data.sectionId !== undefined ? data.sectionId : data.projectId ? null : t.sectionId,
      }),
    };
    const apply = optimistic[action];
    return run({
      optimistic: apply ? (task) => (selected.has(task.id) ? apply(task) : task) : undefined,
      request: async () => {
        await api.post('/tasks/bulk', { taskIds, action, data });
      },
      failure: 'Those tasks could not be updated',
    });
  };

  const updateTask = (id: string, input: Record<string, unknown>) => {
    // Sent later, an edit must not overwrite a change made elsewhere since.
    const version = findCachedTask(qc, id)?.version;
    return run({
      optimistic: only(id, (task) => bumped({ ...task, ...input } as Task)),
      request: async () => (await api.patch(`/tasks/${id}`, input)).data.data as Task,
      onSuccess: reconcile(id),
      failure: 'That change could not be saved',
      queue: {
        method: 'patch',
        url: `/tasks/${id}`,
        body: version ? { ...input, ifVersion: version } : input,
        label: `Your change to ${named(id)}`,
        taskId: id,
      },
    });
  };

  return {
    createTask: (input: CreateTaskInput) => {
      // Its id is chosen here, so sending it again later can't add it twice.
      const body = { ...input, id: crypto.randomUUID() };
      return run({
        request: async () => (await api.post('/tasks', body)).data.data as Task,
        failure: 'The task could not be added',
        queue: { method: 'post', url: '/tasks', body, label: `Adding “${input.content}”`, adds: true },
      });
    },

    quickAddTask: (text: string, projectId?: string, context?: QuickAddContext) =>
      run({
        request: async () =>
          (await api.post('/tasks/quick-add', { text, projectId, ...context })).data.data as Task,
        failure: 'The task could not be added',
        queue: {
          method: 'post',
          url: '/tasks/quick-add',
          body: { text, projectId, ...context },
          label: `Adding “${text}”`,
          adds: true,
        },
      }),

    updateTask,

    rescheduleTask: (id: string, dueDate: string) => updateTask(id, { dueDate }),

    deleteTask,
    restoreTask,

    /** Delete a trashed task for good (no undo). */
    purgeTask: (id: string) =>
      run({
        request: async () => {
          await api.delete(`/tasks/${id}/permanent`);
        },
        failure: 'The task could not be deleted',
      }),

    completeTask: async (id: string, options: ActionOptions = {}) => {
      const result = await run({
        optimistic: only(id, (task) =>
          bumped({
            ...task,
            isCompleted: true,
            completedAt: new Date().toISOString(),
          }),
        ),
        request: async () => (await api.post(`/tasks/${id}/complete`)).data.data as Task,
        // A recurring task answers with its next occurrence; the refetch that
        // follows brings that in, and the completed one stays completed.
        onSuccess: (server) => {
          if (server.id === id) reconcile(id)(server);
        },
        failure: 'The task could not be completed',
        queue: { method: 'post', url: `/tasks/${id}/complete`, label: `Completing ${named(id)}`, taskId: id },
      });
      // No undo for a completion queued offline: it isn't on the server yet.
      if (result && options.undo !== false) {
        toastUndo('Task completed', () => {
          // Undoing a recurring completion also takes back the next occurrence.
          if (result.id !== id) void deleteTask(result.id, { undo: false });
          void uncompleteTask(id);
        });
      }
      return result;
    },

    uncompleteTask,

    moveTask,

    duplicateTask: (id: string) =>
      run({
        request: async () => (await api.post(`/tasks/${id}/duplicate`)).data.data as Task,
        failure: 'The task could not be duplicated',
      }),

    /**
     * `taskIds` is the list in its new order. With `movedId` (the task that
     * was dragged), only that task is placed, after its new neighbour, and
     * only its row changes; without it the whole order is saved.
     */
    reorderTasks: (taskIds: string[], movedId?: string) => {
      if (movedId && taskIds.includes(movedId)) {
        const at = taskIds.indexOf(movedId);
        const afterId = at > 0 ? taskIds[at - 1] : null;
        const prev = afterId ? findCachedTask(qc, afterId)?.sortOrder : undefined;
        const next = taskIds[at + 1] ? findCachedTask(qc, taskIds[at + 1])?.sortOrder : undefined;
        // The same midpoint the server will pick, so the list doesn't jump.
        const sortOrder =
          prev === undefined ? (next === undefined ? 0 : next - 1) : next === undefined ? prev + 1 : (prev + next) / 2;
        return run({
          optimistic: (task) => (task.id === movedId ? { ...task, sortOrder } : task),
          request: async () => {
            await api.post(`/tasks/${movedId}/position`, { afterId });
          },
          failure: 'The new order could not be saved',
        });
      }
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

    bulkUpdate,

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
