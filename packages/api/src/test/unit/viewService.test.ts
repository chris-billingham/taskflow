import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database.js', () => ({
  prisma: {
    task: { findMany: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('../../services/taskService.js', () => ({ taskInclude: {} }));
vi.mock('../../services/access.js', () => ({
  taskAccessWhere: () => ({ __scope: 'access' }),
}));

import { getTodayTasks, getUpcomingTasks } from '../../services/viewService.js';
import { prisma } from '../../config/database.js';

const mockPrisma = prisma as unknown as {
  task: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
};

const USER = 'user-1';

/** A task due today with no time, so it lands in the noTime bucket. */
function task(i: number) {
  return {
    id: `t${i}`,
    content: `Task ${i}`,
    dueDate: new Date('2026-07-26T00:00:00.000Z'),
    dueTime: null,
    sortOrder: i,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-26T12:00:00.000Z'));
  mockPrisma.user.findUnique.mockResolvedValue({ timezone: 'UTC' });
});

/**
 * `counts.total` used to be `tasks.length`, i.e. the length of an array the
 * query had already capped at 500. Once an account crossed the cap the Today
 * badge silently under-reported and the surplus tasks were invisible. The count
 * now comes from a separate count() against the same predicate, so these tests
 * pin that the cap and the count are independent.
 */
describe('getTodayTasks — counts vs cap', () => {
  it('reports the matching total, not the returned length', async () => {
    mockPrisma.task.findMany.mockResolvedValue([task(1), task(2)]);
    mockPrisma.task.count.mockResolvedValue(742);

    const result = await getTodayTasks(USER);

    expect(result.counts.total).toBe(742);
    expect(result.counts.returned).toBe(2);
  });

  it('flags truncation when more matched than were returned', async () => {
    mockPrisma.task.findMany.mockResolvedValue([task(1)]);
    mockPrisma.task.count.mockResolvedValue(600);

    expect((await getTodayTasks(USER)).truncated).toBe(true);
  });

  it('does not flag truncation when everything fits', async () => {
    mockPrisma.task.findMany.mockResolvedValue([task(1), task(2)]);
    mockPrisma.task.count.mockResolvedValue(2);

    const result = await getTodayTasks(USER);
    expect(result.truncated).toBe(false);
    expect(result.counts.total).toBe(2);
  });

  it('counts against the same predicate the list uses', async () => {
    mockPrisma.task.findMany.mockResolvedValue([]);
    mockPrisma.task.count.mockResolvedValue(0);

    await getTodayTasks(USER);

    const listWhere = mockPrisma.task.findMany.mock.calls[0][0].where;
    const countWhere = mockPrisma.task.count.mock.calls[0][0].where;
    expect(countWhere).toEqual(listWhere);
  });

  it('still caps the list at 500', async () => {
    mockPrisma.task.findMany.mockResolvedValue([]);
    mockPrisma.task.count.mockResolvedValue(0);

    await getTodayTasks(USER);

    expect(mockPrisma.task.findMany.mock.calls[0][0].take).toBe(500);
  });

  it('bucket counts still describe what was returned', async () => {
    mockPrisma.task.findMany.mockResolvedValue([task(1), task(2), task(3)]);
    mockPrisma.task.count.mockResolvedValue(900);

    const result = await getTodayTasks(USER);

    // All three are due today with no time.
    expect(result.counts.noTime).toBe(3);
    expect(result.counts.total).toBe(900);
  });

  it('handles an empty view', async () => {
    mockPrisma.task.findMany.mockResolvedValue([]);
    mockPrisma.task.count.mockResolvedValue(0);

    const result = await getTodayTasks(USER);
    expect(result.counts.total).toBe(0);
    expect(result.truncated).toBe(false);
  });
});

describe('getUpcomingTasks — counts vs cap', () => {
  it('reports the matching total for dated tasks', async () => {
    mockPrisma.task.findMany.mockResolvedValue([task(1)]);
    mockPrisma.task.count.mockResolvedValue(300);

    const result = await getUpcomingTasks(USER, 7);

    expect(result.counts.total).toBe(300);
    expect(result.counts.returned).toBe(1);
    expect(result.truncated).toBe(true);
  });

  it('adds the no-date totals when they are requested', async () => {
    // First pair of calls is the dated query, second is the no-date query.
    mockPrisma.task.findMany
      .mockResolvedValueOnce([task(1)])
      .mockResolvedValueOnce([task(2), task(3)]);
    mockPrisma.task.count.mockResolvedValueOnce(10).mockResolvedValueOnce(5);

    const result = await getUpcomingTasks(USER, 7, true);

    expect(result.counts.total).toBe(15);
    expect(result.counts.returned).toBe(3);
    expect(result.noDate).toHaveLength(2);
  });

  it('ignores no-date tasks entirely when not requested', async () => {
    mockPrisma.task.findMany.mockResolvedValue([task(1)]);
    mockPrisma.task.count.mockResolvedValue(1);

    const result = await getUpcomingTasks(USER, 7, false);

    expect(result.counts.total).toBe(1);
    expect(result.noDate).toEqual([]);
    // Only the dated query ran.
    expect(mockPrisma.task.findMany).toHaveBeenCalledTimes(1);
  });
});
