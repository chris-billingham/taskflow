import type { Task } from '@/stores/taskStore';
import type { Project, ProjectSection } from '@/stores/projectStore';

// Factories for API-shaped data. Each call gets a unique id, and every field
// has a realistic default so a test only states what it cares about.

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

const TIMESTAMP = '2026-09-01T09:00:00.000Z';

export const TEST_USER = {
  id: 'user-1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  avatarUrl: null,
  timezone: 'UTC',
  weekStart: 1,
  dateFormat: null,
  timeFormat: null,
  theme: 'light',
  emailVerified: true,
  role: 'USER' as const,
  isActive: true,
};

/** A calendar date as the API sends it: UTC midnight. */
export function apiDate(yyyyMmDd: string): string {
  return `${yyyyMmDd}T00:00:00.000Z`;
}

/** Today's local date as yyyy-MM-dd (what the views compare against). */
export function localDateString(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  const id = overrides.id ?? nextId('project');
  return {
    id,
    name: 'Website relaunch',
    color: '#3B82F6',
    description: null,
    ownerId: TEST_USER.id,
    workspaceId: null,
    parentId: null,
    viewStyle: 'LIST',
    isFavorite: false,
    isArchived: false,
    isInbox: false,
    sortOrder: 0,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    sections: [],
    _count: { tasks: 0 },
    ...overrides,
  };
}

export function makeSection(overrides: Partial<ProjectSection> = {}): ProjectSection {
  return {
    id: nextId('section'),
    name: 'Backlog',
    projectId: 'project-1',
    sortOrder: 0,
    isCollapsed: false,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    _count: { tasks: 0 },
    ...overrides,
  };
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: nextId('task'),
    content: 'Write the launch post',
    description: null,
    projectId: 'project-1',
    sectionId: null,
    parentId: null,
    creatorId: TEST_USER.id,
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
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    taskLabels: [],
    assignee: null,
    subtasks: [],
    _count: { subtasks: 0, comments: 0 },
    ...overrides,
  };
}

/** The API's success envelope. */
export function ok<T>(data: T, extra: Record<string, unknown> = {}) {
  return { success: true, data, ...extra };
}
