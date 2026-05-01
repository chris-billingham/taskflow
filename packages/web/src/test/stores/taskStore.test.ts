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

const mockApi = api as {
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
    let result: typeof SAMPLE_TASK | undefined;
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
