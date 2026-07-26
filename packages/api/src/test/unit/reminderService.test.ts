import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database.js', () => ({
  prisma: {
    reminder: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('../../services/access.js', () => ({
  requireTaskAccess: vi.fn(),
}));

import {
  computeRelativeTriggerAt,
  createReminder,
} from '../../services/reminderService.js';
import { ValidationError } from '../../errors/index.js';
import { prisma } from '../../config/database.js';
import { requireTaskAccess } from '../../services/access.js';

const mockPrisma = prisma as unknown as {
  reminder: { create: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
};
const mockRequireTaskAccess = requireTaskAccess as unknown as ReturnType<typeof vi.fn>;

const USER_ID = 'user-1';
const dueDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('computeRelativeTriggerAt', () => {
  it('returns null without a due date — there is nothing to be relative to', () => {
    expect(computeRelativeTriggerAt(null, '09:00', 30, 'UTC')).toBeNull();
  });

  it('offsets from UTC midnight when the task has no due time', () => {
    const result = computeRelativeTriggerAt(dueDate('2026-07-26'), null, 60, 'UTC');
    expect(result?.toISOString()).toBe('2026-07-25T23:00:00.000Z');
  });

  it('resolves the due time in the USER\'s timezone, not the host\'s', () => {
    // 09:00 in Sydney (UTC+10) is 23:00Z the previous day; 30 minutes before
    // that is 22:30Z on the 25th.
    const result = computeRelativeTriggerAt(
      dueDate('2026-07-26'),
      '09:00',
      30,
      'Australia/Sydney',
    );
    expect(result?.toISOString()).toBe('2026-07-25T22:30:00.000Z');
  });

  it('applies the zone\'s summer offset', () => {
    const result = computeRelativeTriggerAt(
      dueDate('2026-07-26'),
      '09:00',
      60,
      'Europe/London',
    );
    expect(result?.toISOString()).toBe('2026-07-26T07:00:00.000Z');
  });

  it('applies the zone\'s winter offset for the same zone', () => {
    const result = computeRelativeTriggerAt(
      dueDate('2026-01-15'),
      '09:00',
      60,
      'Europe/London',
    );
    expect(result?.toISOString()).toBe('2026-01-15T08:00:00.000Z');
  });

  it('defaults to UTC when no timezone is supplied', () => {
    const result = computeRelativeTriggerAt(dueDate('2026-07-26'), '09:00', 0);
    expect(result?.toISOString()).toBe('2026-07-26T09:00:00.000Z');
  });
});

describe('createReminder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ timezone: 'UTC' });
    mockPrisma.reminder.create.mockImplementation(({ data }: { data: unknown }) => data);
  });

  it('rejects a RELATIVE reminder on a task with no due date', async () => {
    // Previously this stored triggerAt: null — a row the due-reminder poll can
    // never match, while the UI listed it as armed.
    mockRequireTaskAccess.mockResolvedValue({
      id: 'task-1',
      dueDate: null,
      dueTime: null,
    });

    await expect(
      createReminder(
        { taskId: 'task-1', type: 'RELATIVE', minutesBefore: 30 } as never,
        USER_ID,
      ),
    ).rejects.toThrow(ValidationError);

    expect(mockPrisma.reminder.create).not.toHaveBeenCalled();
  });

  it('arms a RELATIVE reminder against the task due date', async () => {
    mockRequireTaskAccess.mockResolvedValue({
      id: 'task-1',
      dueDate: dueDate('2026-07-26'),
      dueTime: '09:00',
    });

    const created = (await createReminder(
      { taskId: 'task-1', type: 'RELATIVE', minutesBefore: 30 } as never,
      USER_ID,
    )) as unknown as { triggerAt: Date };

    expect(created.triggerAt.toISOString()).toBe('2026-07-26T08:30:00.000Z');
  });

  it('stores an ABSOLUTE reminder\'s instant unchanged', async () => {
    mockRequireTaskAccess.mockResolvedValue({
      id: 'task-1',
      dueDate: null,
      dueTime: null,
    });

    const created = (await createReminder(
      {
        taskId: 'task-1',
        type: 'ABSOLUTE',
        triggerAt: '2026-08-01T14:00:00.000Z',
      } as never,
      USER_ID,
    )) as unknown as { triggerAt: Date };

    expect(created.triggerAt.toISOString()).toBe('2026-08-01T14:00:00.000Z');
  });

  it('defaults the delivery method to PUSH', async () => {
    mockRequireTaskAccess.mockResolvedValue({
      id: 'task-1',
      dueDate: dueDate('2026-07-26'),
      dueTime: null,
    });

    const created = (await createReminder(
      { taskId: 'task-1', type: 'RELATIVE', minutesBefore: 10 } as never,
      USER_ID,
    )) as unknown as { method: string };

    expect(created.method).toBe('PUSH');
  });
});
