let counter = 0;

export function buildWorkspace(overrides: Record<string, unknown> = {}) {
  counter++;
  return {
    id: `workspace-${counter}`,
    name: `Test Workspace ${counter}`,
    slug: `workspace-${counter}`,
    ownerId: 'user-1',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function resetCounter() {
  counter = 0;
}
