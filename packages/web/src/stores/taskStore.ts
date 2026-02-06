import { create } from 'zustand';
import api from '@/services/api';

export interface TaskLabel {
  taskId: string;
  labelId: string;
  label: {
    id: string;
    name: string;
    color: string;
  };
}

export interface TaskAssignee {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface Task {
  id: string;
  content: string;
  description: string | null;
  projectId: string;
  sectionId: string | null;
  parentId: string | null;
  creatorId: string;
  assigneeId: string | null;
  dueDate: string | null;
  dueTime: string | null;
  deadline: string | null;
  duration: number | null;
  isRecurring: boolean;
  recurrenceRule: string | null;
  priority: number;
  isCompleted: boolean;
  completedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  taskLabels: TaskLabel[];
  assignee: TaskAssignee | null;
  subtasks?: Task[];
  _count?: { subtasks: number; comments: number };
  // Extended fields for detail view
  project?: { id: string; name: string; color: string };
  section?: { id: string; name: string } | null;
  parent?: { id: string; content: string } | null;
}

export interface TaskQuery {
  projectId?: string;
  sectionId?: string;
  completed?: string;
  priority?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  search?: string;
}

export interface TodayViewData {
  overdue: Task[];
  morning: Task[];
  afternoon: Task[];
  evening: Task[];
  noTime: Task[];
  counts: {
    overdue: number;
    morning: number;
    afternoon: number;
    evening: number;
    noTime: number;
    total: number;
  };
}

export interface UpcomingViewData {
  overdue: Task[];
  byDate: Record<string, Task[]>;
  noDate: Task[];
  counts: {
    overdue: number;
    total: number;
  };
}

interface TaskState {
  tasks: Map<string, Task>;
  loading: boolean;
  error: string | null;

  // View data
  todayView: TodayViewData | null;
  upcomingView: UpcomingViewData | null;
  viewLoading: boolean;

  // Actions
  fetchTasks: (query?: TaskQuery) => Promise<void>;
  fetchTaskById: (id: string) => Promise<Task>;
  createTask: (data: {
    content: string;
    description?: string;
    projectId: string;
    sectionId?: string;
    parentId?: string;
    dueDate?: string;
    dueTime?: string;
    deadline?: string;
    duration?: number;
    priority?: number;
    assigneeId?: string;
    labelIds?: string[];
    isRecurring?: boolean;
    recurrenceRule?: string;
  }) => Promise<Task>;
  updateTask: (id: string, data: Record<string, any>) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  completeTask: (id: string) => Promise<Task>;
  uncompleteTask: (id: string) => Promise<Task>;
  moveTask: (id: string, data: { projectId?: string; sectionId?: string | null; parentId?: string | null }) => Promise<Task>;
  duplicateTask: (id: string) => Promise<Task>;
  bulkUpdate: (taskIds: string[], action: string, data?: Record<string, any>) => Promise<void>;
  quickAddTask: (text: string, projectId?: string) => Promise<Task>;
  reorderTasks: (taskIds: string[]) => Promise<void>;
  setTask: (task: Task) => void;
  removeTask: (id: string) => void;

  // View actions
  fetchTodayView: () => Promise<void>;
  fetchUpcomingView: (days?: number, includeNoDate?: boolean) => Promise<void>;
  rescheduleOverdue: (targetDate: string) => Promise<void>;
  rescheduleTask: (id: string, newDate: string) => Promise<Task>;
}

export const useTaskStore = create<TaskState>()((set, get) => ({
  tasks: new Map(),
  loading: false,
  error: null,
  todayView: null,
  upcomingView: null,
  viewLoading: false,

  fetchTasks: async (query) => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (query) {
        Object.entries(query).forEach(([key, value]) => {
          if (value !== undefined) params.append(key, value);
        });
      }
      const { data } = await api.get(`/tasks?${params.toString()}`);
      const tasks = new Map<string, Task>();
      for (const t of data.data) {
        tasks.set(t.id, t);
        // Also flatten nested subtasks into the Map so they're
        // individually accessible (e.g. for the task detail panel).
        if (t.subtasks && Array.isArray(t.subtasks)) {
          for (const sub of t.subtasks) {
            tasks.set(sub.id, sub);
          }
        }
      }
      set({ tasks, loading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.message || 'Failed to fetch tasks',
        loading: false,
      });
    }
  },

  fetchTaskById: async (id) => {
    const { data } = await api.get(`/tasks/${id}`);
    const task = data.data as Task;
    set((state) => {
      const tasks = new Map(state.tasks);
      tasks.set(task.id, task);
      if (task.subtasks && Array.isArray(task.subtasks)) {
        for (const sub of task.subtasks) {
          tasks.set(sub.id, sub);
        }
      }
      return { tasks };
    });
    return task;
  },

  createTask: async (input) => {
    const { data } = await api.post('/tasks', input);
    const task = data.data as Task;
    set((state) => {
      const tasks = new Map(state.tasks);
      tasks.set(task.id, task);
      return { tasks };
    });
    return task;
  },

  updateTask: async (id, input) => {
    // Optimistic update
    const prev = get().tasks.get(id);
    if (prev) {
      set((state) => {
        const tasks = new Map(state.tasks);
        tasks.set(id, { ...prev, ...input });
        return { tasks };
      });
    }

    try {
      const { data } = await api.patch(`/tasks/${id}`, input);
      const task = data.data as Task;
      set((state) => {
        const tasks = new Map(state.tasks);
        tasks.set(id, task);
        return { tasks };
      });
      return task;
    } catch (err) {
      // Revert
      if (prev) {
        set((state) => {
          const tasks = new Map(state.tasks);
          tasks.set(id, prev);
          return { tasks };
        });
      }
      throw err;
    }
  },

  deleteTask: async (id) => {
    const prev = get().tasks.get(id);
    // Optimistic remove
    set((state) => {
      const tasks = new Map(state.tasks);
      tasks.delete(id);
      return { tasks };
    });

    try {
      await api.delete(`/tasks/${id}`);
    } catch (err) {
      if (prev) {
        set((state) => {
          const tasks = new Map(state.tasks);
          tasks.set(id, prev);
          return { tasks };
        });
      }
      throw err;
    }
  },

  completeTask: async (id) => {
    const prev = get().tasks.get(id);
    // Optimistic
    if (prev) {
      set((state) => {
        const tasks = new Map(state.tasks);
        tasks.set(id, { ...prev, isCompleted: true, completedAt: new Date().toISOString() });
        return { tasks };
      });
    }

    try {
      const { data } = await api.post(`/tasks/${id}/complete`);
      const task = data.data as Task;
      set((state) => {
        const tasks = new Map(state.tasks);
        // If recurring, the response is the new task; keep the completed one too
        if (prev?.isRecurring && task.id !== id) {
          tasks.set(id, { ...prev!, isCompleted: true, completedAt: new Date().toISOString() });
          tasks.set(task.id, task);
        } else {
          tasks.set(id, task);
        }
        return { tasks };
      });
      return task;
    } catch (err) {
      if (prev) {
        set((state) => {
          const tasks = new Map(state.tasks);
          tasks.set(id, prev);
          return { tasks };
        });
      }
      throw err;
    }
  },

  uncompleteTask: async (id) => {
    const prev = get().tasks.get(id);
    if (prev) {
      set((state) => {
        const tasks = new Map(state.tasks);
        tasks.set(id, { ...prev, isCompleted: false, completedAt: null });
        return { tasks };
      });
    }

    try {
      const { data } = await api.post(`/tasks/${id}/uncomplete`);
      const task = data.data as Task;
      set((state) => {
        const tasks = new Map(state.tasks);
        tasks.set(id, task);
        return { tasks };
      });
      return task;
    } catch (err) {
      if (prev) {
        set((state) => {
          const tasks = new Map(state.tasks);
          tasks.set(id, prev);
          return { tasks };
        });
      }
      throw err;
    }
  },

  moveTask: async (id, moveData) => {
    const prev = get().tasks.get(id);
    if (prev) {
      set((state) => {
        const tasks = new Map(state.tasks);
        tasks.set(id, { ...prev, ...moveData });
        return { tasks };
      });
    }

    try {
      const { data } = await api.post(`/tasks/${id}/move`, moveData);
      const task = data.data as Task;
      set((state) => {
        const tasks = new Map(state.tasks);
        tasks.set(id, task);
        return { tasks };
      });
      return task;
    } catch (err) {
      if (prev) {
        set((state) => {
          const tasks = new Map(state.tasks);
          tasks.set(id, prev);
          return { tasks };
        });
      }
      throw err;
    }
  },

  duplicateTask: async (id) => {
    const { data } = await api.post(`/tasks/${id}/duplicate`);
    const task = data.data as Task;
    set((state) => {
      const tasks = new Map(state.tasks);
      tasks.set(task.id, task);
      return { tasks };
    });
    return task;
  },

  bulkUpdate: async (taskIds, action, actionData) => {
    await api.post('/tasks/bulk', { taskIds, action, data: actionData });
    // Refetch after bulk operation
    const state = get();
    const firstTask = state.tasks.get(taskIds[0]);
    if (firstTask?.projectId) {
      await state.fetchTasks({ projectId: firstTask.projectId });
    }
  },

  quickAddTask: async (text, projectId) => {
    const { data } = await api.post('/tasks/quick-add', { text, projectId });
    const task = data.data as Task;
    set((state) => {
      const tasks = new Map(state.tasks);
      tasks.set(task.id, task);
      return { tasks };
    });
    return task;
  },

  reorderTasks: async (taskIds) => {
    // Optimistic update
    const prevTasks = new Map(get().tasks);
    set((state) => {
      const tasks = new Map(state.tasks);
      taskIds.forEach((id, index) => {
        const t = tasks.get(id);
        if (t) {
          tasks.set(id, { ...t, sortOrder: index });
        }
      });
      return { tasks };
    });

    try {
      await api.put('/tasks/reorder', { taskIds });
    } catch (err) {
      set({ tasks: prevTasks });
      throw err;
    }
  },

  fetchTodayView: async () => {
    set({ viewLoading: true, error: null });
    try {
      const { data } = await api.get('/views/today');
      const viewData = data.data as TodayViewData;
      // Merge all tasks into the main map
      set((state) => {
        const tasks = new Map(state.tasks);
        const allViewTasks = [
          ...viewData.overdue,
          ...viewData.morning,
          ...viewData.afternoon,
          ...viewData.evening,
          ...viewData.noTime,
        ];
        for (const t of allViewTasks) {
          tasks.set(t.id, t);
          if (t.subtasks && Array.isArray(t.subtasks)) {
            for (const sub of t.subtasks) {
              tasks.set(sub.id, sub);
            }
          }
        }
        return { tasks, todayView: viewData, viewLoading: false };
      });
    } catch (err: any) {
      set({
        error: err.response?.data?.message || 'Failed to fetch today view',
        viewLoading: false,
      });
    }
  },

  fetchUpcomingView: async (days = 14, includeNoDate = true) => {
    set({ viewLoading: true, error: null });
    try {
      const params = new URLSearchParams({
        days: String(days),
        includeNoDate: includeNoDate ? 'true' : 'false',
      });
      const { data } = await api.get(`/views/upcoming?${params.toString()}`);
      const viewData = data.data as UpcomingViewData;
      // Merge all tasks into the main map
      set((state) => {
        const tasks = new Map(state.tasks);
        const allViewTasks = [
          ...viewData.overdue,
          ...viewData.noDate,
          ...Object.values(viewData.byDate).flat(),
        ];
        for (const t of allViewTasks) {
          tasks.set(t.id, t);
          if (t.subtasks && Array.isArray(t.subtasks)) {
            for (const sub of t.subtasks) {
              tasks.set(sub.id, sub);
            }
          }
        }
        return { tasks, upcomingView: viewData, viewLoading: false };
      });
    } catch (err: any) {
      set({
        error: err.response?.data?.message || 'Failed to fetch upcoming view',
        viewLoading: false,
      });
    }
  },

  rescheduleOverdue: async (targetDate) => {
    await api.post('/views/reschedule-overdue', { targetDate });
    // Refetch both views
    await get().fetchTodayView();
  },

  rescheduleTask: async (id, newDate) => {
    return get().updateTask(id, { dueDate: newDate });
  },

  setTask: (task) => {
    set((state) => {
      const tasks = new Map(state.tasks);
      tasks.set(task.id, task);
      return { tasks };
    });
  },

  removeTask: (id) => {
    set((state) => {
      const tasks = new Map(state.tasks);
      tasks.delete(id);
      return { tasks };
    });
  },
}));

// Selectors
export const selectTasksArray = (state: TaskState) =>
  Array.from(state.tasks.values()).sort((a, b) => a.sortOrder - b.sortOrder);

export const selectTasksByProject = (projectId: string) => (state: TaskState) =>
  Array.from(state.tasks.values())
    .filter((t) => t.projectId === projectId && !t.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

export const selectTasksBySection = (sectionId: string | null) => (state: TaskState) =>
  Array.from(state.tasks.values())
    .filter((t) => t.sectionId === sectionId && !t.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

export const selectSubtasks = (parentId: string) => (state: TaskState) =>
  Array.from(state.tasks.values())
    .filter((t) => t.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

export const selectOverdueTasks = (state: TaskState) => {
  const now = new Date().toISOString().split('T')[0];
  return Array.from(state.tasks.values())
    .filter((t) => t.dueDate && t.dueDate.slice(0, 10) < now && !t.isCompleted)
    .sort((a, b) => (a.dueDate || '').slice(0, 10).localeCompare((b.dueDate || '').slice(0, 10)));
};

export const selectIncompleteTasks = (state: TaskState) =>
  Array.from(state.tasks.values())
    .filter((t) => !t.isCompleted)
    .sort((a, b) => a.sortOrder - b.sortOrder);
