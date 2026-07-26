import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  setAccessToken: vi.fn(),
}));

import { useTaskStore } from '@/stores/taskStore';
import api from '@/services/api';

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const SAMPLE_TASK = {
  id: 'task-1',
  content: 'Sample task',
  projectId: 'proj-1',
  creatorId: 'user-1',
  isCompleted: false,
  priority: 4,
  sortOrder: 1,
  taskLabels: [],
  subtasks: [],
  assignee: null,
  _count: { subtasks: 0, comments: 0 },
  parentId: null,
  sectionId: null,
  dueDate: null,
  dueTime: null,
  deadline: null,
  duration: null,
  isRecurring: false,
  recurrenceRule: null,
  completedAt: null,
  description: null,
  assigneeId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function getStore() {
  return renderHook(() => useTaskStore((s) => s)).result;
}

beforeEach(() => {
  useTaskStore.setState({
    tasks: new Map(),
    loading: false,
    error: null,
    todayView: null,
    upcomingView: null,
    viewLoading: false,
    tasksNextCursor: null,
    tasksPagesLoaded: 0,
    loadingMore: false,
  });
});

describe('taskStore - fetchTasks', () => {
  it('loads tasks into the map', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { data: [SAMPLE_TASK] } });

    const store = getStore();
    await act(async () => {
      await store.current.fetchTasks();
    });

    expect(store.current.tasks.size).toBe(1);
    expect(store.current.tasks.get('task-1')).toMatchObject({ content: 'Sample task' });
    expect(store.current.loading).toBe(false);
    expect(store.current.error).toBeNull();
  });

  it('flattens subtasks into the map', async () => {
    const subtask = { ...SAMPLE_TASK, id: 'subtask-1', parentId: 'task-1' };
    const taskWithSubtasks = { ...SAMPLE_TASK, subtasks: [subtask] };
    mockApi.get.mockResolvedValueOnce({ data: { data: [taskWithSubtasks] } });

    const store = getStore();
    await act(async () => {
      await store.current.fetchTasks();
    });

    expect(store.current.tasks.has('subtask-1')).toBe(true);
  });

  it('sets error state on failure', async () => {
    mockApi.get.mockRejectedValueOnce({
      response: { data: { message: 'Fetch failed' } },
    });

    const store = getStore();
    await act(async () => {
      await store.current.fetchTasks();
    });

    expect(store.current.error).toBe('Fetch failed');
    expect(store.current.loading).toBe(false);
  });

  it('passes query params to the API', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { data: [] } });

    const store = getStore();
    await act(async () => {
      await store.current.fetchTasks({ projectId: 'proj-1' });
    });

    expect(mockApi.get).toHaveBeenCalledWith(expect.stringContaining('projectId=proj-1'));
  });
});

describe('taskStore - createTask', () => {
  it('adds new task to the map and returns it', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { data: SAMPLE_TASK } });

    const store = getStore();
    let result: { id: string } | undefined;
    await act(async () => {
      result = await store.current.createTask({
        content: 'Sample task',
        projectId: 'proj-1',
      });
    });

    expect(result).toMatchObject({ id: 'task-1' });
    expect(store.current.tasks.has('task-1')).toBe(true);
  });
});

describe('taskStore - updateTask', () => {
  it('updates task in the map', async () => {
    useTaskStore.setState({ tasks: new Map([['task-1', SAMPLE_TASK]]) });

    const updated = { ...SAMPLE_TASK, content: 'Updated content' };
    mockApi.patch.mockResolvedValueOnce({ data: { data: updated } });

    const store = getStore();
    await act(async () => {
      await store.current.updateTask('task-1', { content: 'Updated content' });
    });

    expect(store.current.tasks.get('task-1')?.content).toBe('Updated content');
  });
});

describe('taskStore - deleteTask', () => {
  it('removes task from the map', async () => {
    useTaskStore.setState({ tasks: new Map([['task-1', SAMPLE_TASK]]) });
    mockApi.delete.mockResolvedValueOnce({ data: { message: 'Deleted' } });

    const store = getStore();
    await act(async () => {
      await store.current.deleteTask('task-1');
    });

    expect(store.current.tasks.has('task-1')).toBe(false);
  });
});

describe('taskStore - completeTask', () => {
  it('marks task as completed in the map', async () => {
    useTaskStore.setState({ tasks: new Map([['task-1', SAMPLE_TASK]]) });

    const completed = { ...SAMPLE_TASK, isCompleted: true, completedAt: new Date().toISOString() };
    mockApi.post.mockResolvedValueOnce({ data: { data: completed } });

    const store = getStore();
    await act(async () => {
      await store.current.completeTask('task-1');
    });

    expect(store.current.tasks.get('task-1')?.isCompleted).toBe(true);
  });
});

describe('taskStore - setTask / removeTask', () => {
  it('setTask inserts or updates a task in the map', () => {
    const store = getStore();
    act(() => {
      store.current.setTask(SAMPLE_TASK);
    });
    expect(store.current.tasks.get('task-1')).toMatchObject({ content: 'Sample task' });
  });

  it('removeTask deletes a task from the map', () => {
    useTaskStore.setState({ tasks: new Map([['task-1', SAMPLE_TASK]]) });

    const store = getStore();
    act(() => {
      store.current.removeTask('task-1');
    });
    expect(store.current.tasks.has('task-1')).toBe(false);
  });
});

describe('taskStore - resyncTasks', () => {
  const taskOnPage = (id: string) => ({ ...SAMPLE_TASK, id, content: `task ${id}` });

  it('re-reads the list without flipping the loading flag', async () => {
    // A resync happens on every reconnect — roughly every 15 minutes, when the
    // server drops sockets holding an expired token. Flashing a skeleton over
    // unchanged content that often would be worse than the staleness it fixes.
    useTaskStore.setState({ tasksPagesLoaded: 1 });
    mockApi.get.mockResolvedValueOnce({
      data: { data: [taskOnPage('t1')], nextCursor: null },
    });

    const store = getStore();
    const seenLoading: boolean[] = [];
    const unsub = useTaskStore.subscribe((s) => seenLoading.push(s.loading));

    await act(async () => {
      await store.current.resyncTasks({ projectId: 'proj-1' });
    });
    unsub();

    expect(store.current.tasks.has('t1')).toBe(true);
    expect(seenLoading).not.toContain(true);
  });

  it('restores every page the reader had already loaded', async () => {
    // fetchTasks would collapse a paginated list back to page one, yanking a
    // reader who had scrolled a long project up to the top.
    useTaskStore.setState({ tasksPagesLoaded: 3 });
    mockApi.get
      .mockResolvedValueOnce({ data: { data: [taskOnPage('t1')], nextCursor: 'c1' } })
      .mockResolvedValueOnce({ data: { data: [taskOnPage('t2')], nextCursor: 'c2' } })
      .mockResolvedValueOnce({ data: { data: [taskOnPage('t3')], nextCursor: 'c3' } });

    const store = getStore();
    await act(async () => {
      await store.current.resyncTasks({ projectId: 'proj-1' });
    });

    expect(mockApi.get).toHaveBeenCalledTimes(3);
    expect([...store.current.tasks.keys()]).toEqual(['t1', 't2', 't3']);
    // Still more to come, so "Load more" stays available.
    expect(store.current.tasksNextCursor).toBe('c3');
    expect(store.current.tasksPagesLoaded).toBe(3);

    // Pages 2 and 3 are requested with the cursor the previous page returned.
    expect(mockApi.get.mock.calls[1][0]).toContain('cursor=c1');
    expect(mockApi.get.mock.calls[2][0]).toContain('cursor=c2');
  });

  it('stops early when the list has shrunk below the loaded depth', async () => {
    useTaskStore.setState({ tasksPagesLoaded: 3 });
    mockApi.get
      .mockResolvedValueOnce({ data: { data: [taskOnPage('t1')], nextCursor: 'c1' } })
      .mockResolvedValueOnce({ data: { data: [taskOnPage('t2')], nextCursor: null } });

    const store = getStore();
    await act(async () => {
      await store.current.resyncTasks({ projectId: 'proj-1' });
    });

    expect(mockApi.get).toHaveBeenCalledTimes(2);
    expect(store.current.tasksNextCursor).toBeNull();
    expect(store.current.tasksPagesLoaded).toBe(2);
  });

  it('drops tasks that no longer match, rather than merging them', async () => {
    // The point of a resync is to converge on the server's answer: a task deleted
    // while the socket was down has to disappear.
    useTaskStore.setState({
      tasks: new Map([['gone', taskOnPage('gone')]]),
      tasksPagesLoaded: 1,
    });
    mockApi.get.mockResolvedValueOnce({
      data: { data: [taskOnPage('t1')], nextCursor: null },
    });

    const store = getStore();
    await act(async () => {
      await store.current.resyncTasks({ projectId: 'proj-1' });
    });

    expect(store.current.tasks.has('gone')).toBe(false);
    expect(store.current.tasks.has('t1')).toBe(true);
  });

  it('keeps what is on screen when the resync fails', async () => {
    useTaskStore.setState({
      tasks: new Map([['t1', taskOnPage('t1')]]),
      tasksPagesLoaded: 1,
    });
    mockApi.get.mockRejectedValueOnce(new Error('offline'));

    const store = getStore();
    await act(async () => {
      await store.current.resyncTasks({ projectId: 'proj-1' });
    });

    // Stale beats empty, and no error is surfaced for a background reconcile.
    expect(store.current.tasks.has('t1')).toBe(true);
    expect(store.current.error).toBeNull();
  });

  it('yields to a newer fetch started while it was in flight', async () => {
    // e.g. the reader switches project mid-resync; that fetch is the truth.
    useTaskStore.setState({ tasksPagesLoaded: 1 });
    let release: (v: unknown) => void = () => {};
    mockApi.get.mockReturnValueOnce(
      new Promise((r) => {
        release = r;
      }),
    );

    const store = getStore();
    const inFlight = store.current.resyncTasks({ projectId: 'proj-1' });

    // A newer fetch lands first and wins the sequence number.
    mockApi.get.mockResolvedValueOnce({
      data: { data: [taskOnPage('newer')], nextCursor: null },
    });
    await act(async () => {
      await store.current.fetchTasks({ projectId: 'proj-2' });
    });

    await act(async () => {
      release({ data: { data: [taskOnPage('stale')], nextCursor: null } });
      await inFlight;
    });

    expect(store.current.tasks.has('newer')).toBe(true);
    expect(store.current.tasks.has('stale')).toBe(false);
  });
});
