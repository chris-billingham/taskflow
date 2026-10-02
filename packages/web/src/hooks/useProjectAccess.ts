import { useQuery } from '@tanstack/react-query';
import type { AccessLevel } from '@taskflow/contract';
import { projectListQuery } from '@/queries/projects';
import { useAuthStore } from '@/stores/authStore';
import type { Task } from '@/types/task';

const RANK: Record<AccessLevel, number> = { VIEW: 0, COMMENT: 1, EDIT: 2, ADMIN: 3 };

export const atLeast = (have: AccessLevel, need: AccessLevel) => RANK[have] >= RANK[need];

/**
 * Your access to a project, from the project list, so pages can leave out
 * controls you can't use. Unknown (the list is still loading) counts as edit:
 * the server checks every change anyway.
 */
export function useProjectAccess(projectId: string | null | undefined): AccessLevel {
  const { data } = useQuery({
    ...projectListQuery,
    select: (projects) => projects.find((p) => p.id === projectId)?.access,
  });
  return data ?? 'EDIT';
}

/** Your access to a task: its project's, raised to edit when it's assigned to you. */
export function useTaskAccess(task: Pick<Task, 'projectId' | 'assigneeId'>): AccessLevel {
  const level = useProjectAccess(task.projectId);
  const userId = useAuthStore((s) => s.user?.id);
  if (task.assigneeId && task.assigneeId === userId && !atLeast(level, 'EDIT')) return 'EDIT';
  return level;
}

/** Whether you can change the task. */
export function useCanEditTask(task: Pick<Task, 'projectId' | 'assigneeId'>): boolean {
  return atLeast(useTaskAccess(task), 'EDIT');
}
