import type { Task } from '@/stores/taskStore';

const indexCache = new WeakMap<Map<string, Task>, Map<string, Task[]>>();
const EMPTY: Task[] = [];

/**
 * O(1) subtask lookup backed by a parent→children index built once per store
 * snapshot. The task store replaces its Map instance on every mutation, so
 * the WeakMap cache invalidates itself automatically.
 *
 * Replaces per-row full-store scans (`Array.from(allTasks.values()).filter…`)
 * that made every list, board and smart-view render O(n²).
 */
export function getSubtasks(
  allTasks: Map<string, Task>,
  parentId: string,
): Task[] {
  let index = indexCache.get(allTasks);
  if (!index) {
    index = new Map<string, Task[]>();
    for (const task of allTasks.values()) {
      if (!task.parentId) continue;
      const list = index.get(task.parentId);
      if (list) {
        list.push(task);
      } else {
        index.set(task.parentId, [task]);
      }
    }
    for (const list of index.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    indexCache.set(allTasks, index);
  }
  return index.get(parentId) ?? EMPTY;
}
