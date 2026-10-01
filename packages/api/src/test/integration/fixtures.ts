// Rows shaped exactly like the services' Prisma results (Dates and all), so
// route suites exercise the real response contract. Override what a test
// cares about; everything else is a realistic default.

const AT = new Date('2026-09-01T09:00:00.000Z');

export function userSummary(overrides: Record<string, unknown> = {}) {
  return { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com', avatarUrl: null, ...overrides };
}

export function labelRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'label-1',
    name: 'errands',
    color: '#6B7280',
    userId: 'user-1',
    isFavorite: false,
    sortOrder: 0,
    version: 1,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

export function sectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'section-1',
    name: 'Backlog',
    projectId: 'proj-1',
    sortOrder: 0,
    version: 1,
    isCollapsed: false,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

export function projectFieldsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    name: 'Work',
    color: '#6366f1',
    description: null,
    ownerId: 'user-1',
    workspaceId: null,
    parentId: null,
    viewStyle: 'LIST' as const,
    isFavorite: false,
    isArchived: false,
    isInbox: false,
    sortOrder: 1,
    version: 1,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

export function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    ...projectFieldsRow(),
    sections: [],
    _count: { tasks: 0 },
    children: [],
    ...overrides,
  };
}

export function taskFieldsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    content: 'Sample task',
    description: null,
    projectId: 'proj-1',
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
    sortOrder: 0,
    version: 1,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

/** A task list item (no nested subtasks). */
export function taskListRow(overrides: Record<string, unknown> = {}) {
  return {
    ...taskFieldsRow(),
    taskLabels: [],
    assignee: null,
    _count: { subtasks: 0, comments: 0 },
    ...overrides,
  };
}

/** A task with subtasks, as mutations return it. */
export function taskRow(overrides: Record<string, unknown> = {}) {
  return { ...taskListRow(), subtasks: [], ...overrides };
}

/** GET /tasks/:id. */
export function taskDetailRow(overrides: Record<string, unknown> = {}) {
  return {
    ...taskRow(),
    project: { id: 'proj-1', name: 'Work', color: '#6366f1' },
    section: null,
    parent: null,
    comments: [],
    ...overrides,
  };
}
