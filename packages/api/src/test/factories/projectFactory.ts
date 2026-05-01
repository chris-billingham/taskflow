let counter = 0;

export function buildProject(overrides: Record<string, unknown> = {}) {
  counter++;
  return {
    id: `project-${counter}`,
    name: `Test Project ${counter}`,
    description: null,
    color: '#6366f1',
    icon: null,
    ownerId: 'user-1',
    workspaceId: 'workspace-1',
    parentId: null,
    isInbox: false,
    isArchived: false,
    isFavorite: false,
    viewStyle: 'LIST',
    sortOrder: counter,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function resetCounter() {
  counter = 0;
}
