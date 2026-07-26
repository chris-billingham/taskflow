import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/redis.js', () => ({
  createBullMQConnection: vi.fn(() => ({})),
}));

vi.mock('bullmq', () => ({
  Queue: class {},
  Worker: class {},
}));

vi.mock('../../config/database.js', () => ({
  prisma: {
    task: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    notification: { findFirst: vi.fn() },
  },
}));

const notifyMock = vi.hoisted(() => vi.fn());
vi.mock('../../services/notificationService.js', () => ({ notify: notifyMock }));

import { runDueTaskCheck } from '../../jobs/dueTaskJob.js';
import { prisma } from '../../config/database.js';

const mockPrisma = prisma as unknown as {
  task: { findMany: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
  notification: { findFirst: ReturnType<typeof vi.fn> };
};

const UPDATED_AT = new Date('2026-07-20T00:00:00.000Z');

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    content: 'Ship the thing',
    projectId: 'p1',
    dueDate: new Date('2026-07-26T00:00:00.000Z'),
    dueTime: null,
    assigneeId: 'u1',
    creatorId: 'u9',
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function setTimezone(tz: string) {
  mockPrisma.user.findUnique.mockResolvedValue({ timezone: tz });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.notification.findFirst.mockResolvedValue(null);
  setTimezone('UTC');
});

describe('runDueTaskCheck — recipient selection', () => {
  it('notifies the assignee when there is one', async () => {
    mockPrisma.task.findMany.mockResolvedValue([task()]);

    await runDueTaskCheck(new Date('2026-07-26T08:00:00.000Z'));

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock.mock.calls[0][0]).toBe('u1');
  });

  it('falls back to the creator when nobody is assigned', async () => {
    mockPrisma.task.findMany.mockResolvedValue([task({ assigneeId: null })]);

    await runDueTaskCheck(new Date('2026-07-26T08:00:00.000Z'));

    expect(notifyMock.mock.calls[0][0]).toBe('u9');
  });

  it('skips a task with neither assignee nor creator', async () => {
    mockPrisma.task.findMany.mockResolvedValue([
      task({ assigneeId: null, creatorId: null }),
    ]);

    await runDueTaskCheck(new Date('2026-07-26T08:00:00.000Z'));

    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe('runDueTaskCheck — due soon', () => {
  it('announces a date-only task at 08:00 in the user\'s timezone', async () => {
    mockPrisma.task.findMany.mockResolvedValue([task()]);

    const result = await runDueTaskCheck(new Date('2026-07-26T08:00:00.000Z'));

    expect(result.dueSoon).toBe(1);
    expect(notifyMock.mock.calls[0][1]).toBe('TASK_DUE_SOON');
  });

  it('stays silent before the user\'s 08:00', async () => {
    mockPrisma.task.findMany.mockResolvedValue([task()]);

    const result = await runDueTaskCheck(new Date('2026-07-26T05:00:00.000Z'));

    expect(result.dueSoon).toBe(0);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('uses the USER\'s 08:00, not the server\'s (Asia/Tokyo, UTC+9)', async () => {
    setTimezone('Asia/Tokyo');
    mockPrisma.task.findMany.mockResolvedValue([task()]);

    // 08:00 Tokyo on the 26th is 23:00Z on the 25th.
    const early = await runDueTaskCheck(new Date('2026-07-25T22:00:00.000Z'));
    expect(early.dueSoon).toBe(0);

    const onTime = await runDueTaskCheck(new Date('2026-07-25T23:00:00.000Z'));
    expect(onTime.dueSoon).toBe(1);
  });

  it('counts down to the actual instant for a timed task', async () => {
    mockPrisma.task.findMany.mockResolvedValue([task({ dueTime: '14:00' })]);

    // The window opens one hour before 14:00 UTC.
    const early = await runDueTaskCheck(new Date('2026-07-26T12:30:00.000Z'));
    expect(early.dueSoon).toBe(0);

    const onTime = await runDueTaskCheck(new Date('2026-07-26T13:00:00.000Z'));
    expect(onTime.dueSoon).toBe(1);
    expect(notifyMock.mock.calls[0][3]).toContain('14:00');
  });

  it('resolves a timed task\'s due instant in the user\'s timezone', async () => {
    setTimezone('America/New_York');
    mockPrisma.task.findMany.mockResolvedValue([task({ dueTime: '14:00' })]);

    // 14:00 EDT is 18:00Z, so the window opens at 17:00Z.
    const early = await runDueTaskCheck(new Date('2026-07-26T16:30:00.000Z'));
    expect(early.dueSoon).toBe(0);

    const onTime = await runDueTaskCheck(new Date('2026-07-26T17:00:00.000Z'));
    expect(onTime.dueSoon).toBe(1);
  });
});

describe('runDueTaskCheck — overdue', () => {
  it('announces a past-due task at 09:00 local', async () => {
    mockPrisma.task.findMany.mockResolvedValue([
      task({ dueDate: new Date('2026-07-24T00:00:00.000Z') }),
    ]);

    const result = await runDueTaskCheck(new Date('2026-07-26T09:00:00.000Z'));

    expect(result.overdue).toBe(1);
    expect(result.dueSoon).toBe(0);
    expect(notifyMock.mock.calls[0][1]).toBe('TASK_OVERDUE');
  });

  it('waits for the civil hour rather than firing at local midnight', async () => {
    mockPrisma.task.findMany.mockResolvedValue([
      task({ dueDate: new Date('2026-07-24T00:00:00.000Z') }),
    ]);

    const result = await runDueTaskCheck(new Date('2026-07-26T01:00:00.000Z'));

    expect(result.overdue).toBe(0);
  });

  it('treats a task due today as due-soon, not overdue', async () => {
    mockPrisma.task.findMany.mockResolvedValue([task()]);

    const result = await runDueTaskCheck(new Date('2026-07-26T10:00:00.000Z'));

    expect(result.overdue).toBe(0);
    expect(result.dueSoon).toBe(1);
  });
});

describe('runDueTaskCheck — deduplication', () => {
  it('says nothing twice for the same task and edit', async () => {
    mockPrisma.task.findMany.mockResolvedValue([task()]);
    mockPrisma.notification.findFirst.mockResolvedValue({ id: 'existing' });

    const result = await runDueTaskCheck(new Date('2026-07-26T08:00:00.000Z'));

    expect(result.dueSoon).toBe(0);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('scopes the dedupe lookup to this task and its updatedAt', async () => {
    mockPrisma.task.findMany.mockResolvedValue([task()]);

    await runDueTaskCheck(new Date('2026-07-26T08:00:00.000Z'));

    expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'u1',
          type: 'TASK_DUE_SOON',
          data: { path: ['taskId'], equals: 't1' },
          createdAt: { gte: UPDATED_AT },
        }),
      }),
    );
  });
});

describe('runDueTaskCheck — resilience', () => {
  it('falls back to UTC for an invalid stored timezone', async () => {
    setTimezone('Not/AZone');
    mockPrisma.task.findMany.mockResolvedValue([task()]);

    const result = await runDueTaskCheck(new Date('2026-07-26T08:00:00.000Z'));

    expect(result.dueSoon).toBe(1);
  });

  it('returns zero counts when there is nothing to do', async () => {
    mockPrisma.task.findMany.mockResolvedValue([]);

    await expect(runDueTaskCheck(new Date())).resolves.toEqual({
      dueSoon: 0,
      overdue: 0,
    });
  });

  it('resolves each user\'s timezone only once across many tasks', async () => {
    mockPrisma.task.findMany.mockResolvedValue([
      task({ id: 't1' }),
      task({ id: 't2' }),
      task({ id: 't3' }),
    ]);

    await runDueTaskCheck(new Date('2026-07-26T08:00:00.000Z'));

    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledTimes(3);
  });
});
