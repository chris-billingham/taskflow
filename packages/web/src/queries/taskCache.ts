import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import type { Task, TodayViewData, UpcomingViewData } from '@/types/task';
import { taskKeys, type TaskQueryKind } from './taskKeys';

export interface TaskPage {
  tasks: Task[];
  nextCursor: string | null;
}

/** Returns the task changed, the same task untouched, or null to remove it. */
export type TaskMapper = (task: Task) => Task | null;

function mapOne(task: Task, fn: TaskMapper): Task | null {
  const next = fn(task);
  if (!next) return null;
  if (next.subtasks) {
    const subtasks = mapList(next.subtasks as Task[], fn);
    if (subtasks !== next.subtasks) return { ...next, subtasks: subtasks as Task['subtasks'] };
  }
  return next;
}

/** Map a list, keeping the same array when nothing changed. */
function mapList<T extends Task>(list: T[], fn: TaskMapper): T[] {
  let changed = false;
  const out: T[] = [];
  for (const task of list) {
    const next = mapOne(task, fn);
    if (next !== task) changed = true;
    if (next) out.push(next as T);
  }
  return changed ? out : list;
}

function mapPages(data: InfiniteData<TaskPage>, fn: TaskMapper): InfiniteData<TaskPage> {
  let changed = false;
  const pages = data.pages.map((page) => {
    const tasks = mapList(page.tasks, fn);
    if (tasks === page.tasks) return page;
    changed = true;
    return { ...page, tasks };
  });
  return changed ? { ...data, pages } : data;
}

function mapToday(view: TodayViewData, fn: TaskMapper): TodayViewData {
  const m = (list: TodayViewData['overdue']) => mapList(list as Task[], fn) as TodayViewData['overdue'];
  return {
    ...view,
    overdue: m(view.overdue),
    morning: m(view.morning),
    afternoon: m(view.afternoon),
    evening: m(view.evening),
    noTime: m(view.noTime),
  };
}

function mapUpcoming(view: UpcomingViewData, fn: TaskMapper): UpcomingViewData {
  const m = (list: UpcomingViewData['overdue']) => mapList(list as Task[], fn) as UpcomingViewData['overdue'];
  const byDate: UpcomingViewData['byDate'] = {};
  for (const [date, list] of Object.entries(view.byDate)) byDate[date] = m(list);
  return { ...view, overdue: m(view.overdue), noDate: m(view.noDate), byDate };
}

function mapData(kind: TaskQueryKind, data: unknown, fn: TaskMapper): unknown {
  switch (kind) {
    case 'list':
    case 'filter':
      return mapPages(data as InfiniteData<TaskPage>, fn);
    case 'subtasks':
      return mapList(data as Task[], fn);
    case 'today':
      return mapToday(data as TodayViewData, fn);
    case 'upcoming':
      return mapUpcoming(data as UpcomingViewData, fn);
    case 'detail':
      // A deleted task's detail stays cached; its panel is closed by then.
      return mapOne(data as Task, fn) ?? data;
  }
}

/**
 * Apply a change to a task everywhere it is cached: every list, view, filter,
 * subtask list and detail, including copies embedded as subtasks. This is what
 * makes an edit in one place show up in every other place at once.
 */
export function patchTaskCaches(qc: QueryClient, fn: TaskMapper): void {
  for (const [key, data] of qc.getQueriesData({ queryKey: taskKeys.all })) {
    if (data === undefined) continue;
    const next = mapData(key[1] as TaskQueryKind, data, fn);
    if (next !== data) qc.setQueryData(key, next);
  }
}

/** Snapshot every task query, to roll an optimistic change back. */
export function snapshotTaskCaches(qc: QueryClient): Array<[QueryKey, unknown]> {
  return qc.getQueriesData({ queryKey: taskKeys.all });
}

/** Any cached copy of a task, e.g. to show its panel before the detail loads. */
export function findCachedTask(qc: QueryClient, id: string): Task | undefined {
  let found: Task | undefined;
  const detail = qc.getQueryData<Task>(taskKeys.detail(id));
  if (detail) return detail;
  patchTaskCaches(qc, (task) => {
    if (!found && task.id === id) found = task;
    return task;
  });
  return found;
}

/**
 * Merge a server response into a cached copy. Responses differ in what they
 * embed (a list item has no subtasks, a mutation response no project), so keep
 * the cached parts the response left out.
 */
export function mergeTask(cached: Task, server: Task): Task {
  return {
    ...cached,
    ...server,
    subtasks: server.subtasks ?? cached.subtasks,
    project: server.project ?? cached.project,
    section: server.section ?? cached.section,
    _count: server._count ?? cached._count,
  };
}
