let counter = 0;

export function buildTask(overrides: Record<string, unknown> = {}) {
  counter++;
  return {
    id: `task-${counter}`,
    content: `Test Task ${counter}`,
    description: null,
    projectId: 'project-1',
    sectionId: null,
    parentId: null,
    creatorId: 'user-1',
    assigneeId: null,
    dueDate: null,
    dueTime: null,
    deadline: null,
    duration: null,
    isRecurring: false,
    recurrenceRule: null,
    priority: 4,
    isCompleted: false,
    completedAt: null,
    sortOrder: counter,
    taskLabels: [],
    subtasks: [],
    assignee: null,
    _count: { subtasks: 0, comments: 0 },
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function resetCounter() {
  counter = 0;
}
