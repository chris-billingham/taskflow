import { useEffect, useCallback } from 'react';
import {
  useTaskStore,
  selectTasksByProject,
  selectTasksBySection,
  selectSubtasks,
} from '@/stores/taskStore';
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

  useEffect(() => {
    fetchTasks(query);
  }, [fetchTasks, query?.projectId, query?.sectionId, query?.completed]);

  return { tasks, loading, error, refetch: () => fetchTasks(query) };
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
  };
}
