import { describe, it, expect } from 'vitest';
import type { InfiniteData } from '@tanstack/react-query';
import { createTestQueryClient } from '../helpers/renderPage';
import { makeTask } from '../msw/fixtures';
import { taskKeys } from '@/queries/taskKeys';
import { findCachedTask, mergeTask, patchTaskCaches, type TaskPage } from '@/queries/taskCache';
import type { Task, TodayViewData } from '@/types/task';

function seed() {
  const qc = createTestQueryClient();
  const shared = makeTask({ id: 't1', content: 'Shared' });
  const parent = makeTask({ id: 'p1', subtasks: [makeTask({ id: 't1', content: 'Shared', parentId: 'p1' })] as Task['subtasks'] });
  qc.setQueryData<InfiniteData<TaskPage>>(taskKeys.list({ projectId: 'project-1' }), {
    pages: [{ tasks: [shared, makeTask({ id: 't2' })], nextCursor: null }],
    pageParams: [undefined],
  });
  qc.setQueryData<TodayViewData>(taskKeys.today(), {
    overdue: [],
    morning: [],
    afternoon: [],
    evening: [],
    noTime: [parent],
    counts: { overdue: 0, morning: 0, afternoon: 0, evening: 0, noTime: 1, total: 1, returned: 1 },
    truncated: false,
  } as unknown as TodayViewData);
  qc.setQueryData(taskKeys.detail('t1'), shared);
  return qc;
}

describe('task cache helpers', () => {
  it('patches a task in every list, view, embedded subtask and detail', () => {
    const qc = seed();
    patchTaskCaches(qc, (t) => (t.id === 't1' ? { ...t, content: 'Renamed' } : t));

    const list = qc.getQueryData<InfiniteData<TaskPage>>(taskKeys.list({ projectId: 'project-1' }))!;
    expect(list.pages[0].tasks[0].content).toBe('Renamed');
    const today = qc.getQueryData<TodayViewData>(taskKeys.today())!;
    expect((today.noTime[0].subtasks as Task[])[0].content).toBe('Renamed');
    expect(qc.getQueryData<Task>(taskKeys.detail('t1'))!.content).toBe('Renamed');
  });

  it('removes a task everywhere but keeps its detail', () => {
    const qc = seed();
    patchTaskCaches(qc, (t) => (t.id === 't1' ? null : t));

    const list = qc.getQueryData<InfiniteData<TaskPage>>(taskKeys.list({ projectId: 'project-1' }))!;
    expect(list.pages[0].tasks.map((t) => t.id)).toEqual(['t2']);
    const today = qc.getQueryData<TodayViewData>(taskKeys.today())!;
    expect(today.noTime[0].subtasks).toEqual([]);
    expect(qc.getQueryData(taskKeys.detail('t1'))).toBeDefined();
  });

  it('leaves untouched data as the same object, so nothing re-renders', () => {
    const qc = seed();
    const before = qc.getQueryData(taskKeys.list({ projectId: 'project-1' }));
    patchTaskCaches(qc, (t) => t);
    expect(qc.getQueryData(taskKeys.list({ projectId: 'project-1' }))).toBe(before);
  });

  it('finds any cached copy of a task', () => {
    const qc = seed();
    qc.removeQueries({ queryKey: taskKeys.detail('t1') });
    expect(findCachedTask(qc, 't1')?.content).toBe('Shared');
    expect(findCachedTask(qc, 'missing')).toBeUndefined();
  });

  it('keeps cached parts a server response left out', () => {
    const cached = makeTask({ id: 't1', project: { id: 'p', name: 'Work', color: '#000' } as Task['project'] });
    const server = makeTask({ id: 't1', content: 'New' });
    delete (server as Partial<Task>).subtasks;
    const merged = mergeTask(cached, server);
    expect(merged.content).toBe('New');
    expect(merged.project?.name).toBe('Work');
    expect(merged.subtasks).toEqual([]);
  });
});
