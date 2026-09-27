/**
 * Every task query lives under ['tasks', kind, ...]. The kind (index 1) tells
 * the cache helpers what shape the data has; see taskCache.ts.
 */
export const taskKeys = {
  all: ['tasks'] as const,
  /** Paged list: InfiniteData<TaskPage>. */
  list: (params: { projectId?: string }) => ['tasks', 'list', params] as const,
  /** A task's subtasks: Task[]. */
  subtasks: (parentId: string) => ['tasks', 'subtasks', parentId] as const,
  /** TodayView. */
  today: () => ['tasks', 'today'] as const,
  /** UpcomingView. */
  upcoming: (days: number, includeNoDate: boolean) =>
    ['tasks', 'upcoming', { days, includeNoDate }] as const,
  /** Paged filter results: InfiniteData<TaskPage>. */
  filter: (query: string) => ['tasks', 'filter', query] as const,
  /** One task with its project, section and subtasks: Task. */
  detail: (id: string) => ['tasks', 'detail', id] as const,
};

export type TaskQueryKind = 'list' | 'subtasks' | 'today' | 'upcoming' | 'filter' | 'detail';
