let counter = 0;

export function buildUser(overrides: Record<string, unknown> = {}) {
  counter++;
  return {
    id: `user-${counter}`,
    email: `user${counter}@example.com`,
    name: `Test User ${counter}`,
    passwordHash: '$2b$12$testhashedpassword',
    role: 'USER' as const,
    isActive: true,
    emailVerified: false,
    emailVerifyToken: null,
    avatarUrl: null,
    timezone: 'UTC',
    weekStart: 0,
    dateFormat: null,
    timeFormat: null,
    theme: null,
    lastLoginAt: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function resetCounter() {
  counter = 0;
}
