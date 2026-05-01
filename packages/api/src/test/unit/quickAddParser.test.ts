import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database.js', () => ({
  prisma: {
    project: { findFirst: vi.fn() },
    label: { findMany: vi.fn() },
  },
}));

import { parseQuickAdd } from '../../utils/quickAddParser.js';
import { prisma } from '../../config/database.js';

const mockPrisma = prisma as unknown as {
  project: { findFirst: ReturnType<typeof vi.fn> };
  label: { findMany: ReturnType<typeof vi.fn> };
};

const TEST_USER_ID = 'user-test';

// Fix date to Thursday 2024-01-04T12:00:00Z for predictable day-of-week results
const FIXED_DATE = new Date('2024-01-04T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_DATE);
  mockPrisma.project.findFirst.mockResolvedValue(null);
  mockPrisma.label.findMany.mockResolvedValue([]);
});

describe('parseQuickAdd - content extraction', () => {
  it('returns raw text as content when no tokens found', async () => {
    const result = await parseQuickAdd('Buy groceries', TEST_USER_ID);
    expect(result.content).toBe('Buy groceries');
  });

  it('trims extra whitespace in content', async () => {
    const result = await parseQuickAdd('  Do the thing  ', TEST_USER_ID);
    expect(result.content).toBe('Do the thing');
  });

  it('removes parsed tokens from content', async () => {
    const result = await parseQuickAdd('Buy groceries p1', TEST_USER_ID);
    expect(result.content).toBe('Buy groceries');
    expect(result.priority).toBe(1);
  });
});

describe('parseQuickAdd - priority parsing', () => {
  it.each([
    ['Task p1', 1],
    ['Task p2', 2],
    ['Task p3', 3],
    ['Task p4', 4],
    ['Task P1', 1],
  ] as [string, number][])('parses priority from "%s"', async (input, expected) => {
    const result = await parseQuickAdd(input, TEST_USER_ID);
    expect(result.priority).toBe(expected);
  });

  it('parses !!! as priority 1', async () => {
    const result = await parseQuickAdd('Urgent task !!!', TEST_USER_ID);
    expect(result.priority).toBe(1);
  });

  it('parses !! as priority 2', async () => {
    const result = await parseQuickAdd('High task !!', TEST_USER_ID);
    expect(result.priority).toBe(2);
  });

  it('parses ! as priority 3', async () => {
    const result = await parseQuickAdd('Task !', TEST_USER_ID);
    expect(result.priority).toBe(3);
  });

  it('prefers p-notation over exclamation when both present', async () => {
    const result = await parseQuickAdd('Task p1 !', TEST_USER_ID);
    expect(result.priority).toBe(1);
  });

  it('sets no priority when none specified', async () => {
    const result = await parseQuickAdd('Just a task', TEST_USER_ID);
    expect(result.priority).toBeUndefined();
  });
});

describe('parseQuickAdd - date parsing', () => {
  it('parses "today" as today\'s date', async () => {
    const result = await parseQuickAdd('Call John today', TEST_USER_ID);
    expect(result.dueDate).toBe('2024-01-04');
  });

  it('parses "tomorrow" as next day', async () => {
    const result = await parseQuickAdd('Meeting tomorrow', TEST_USER_ID);
    expect(result.dueDate).toBe('2024-01-05');
  });

  it('parses "next week" as next Monday', async () => {
    const result = await parseQuickAdd('Review next week', TEST_USER_ID);
    expect(result.dueDate).toBe('2024-01-08'); // next Monday from Thursday Jan 4
  });

  it('parses "in 3 days"', async () => {
    const result = await parseQuickAdd('Follow up in 3 days', TEST_USER_ID);
    expect(result.dueDate).toBe('2024-01-07');
  });

  it('parses "friday" as next Friday', async () => {
    const result = await parseQuickAdd('Submit report friday', TEST_USER_ID);
    expect(result.dueDate).toBe('2024-01-05'); // Next Friday from Thursday Jan 4
  });

  it('parses "monday" as next Monday', async () => {
    const result = await parseQuickAdd('Review monday', TEST_USER_ID);
    expect(result.dueDate).toBe('2024-01-08'); // Next Monday from Thursday Jan 4
  });

  it('sets no dueDate when no date keyword present', async () => {
    const result = await parseQuickAdd('Just a task', TEST_USER_ID);
    expect(result.dueDate).toBeUndefined();
  });
});

describe('parseQuickAdd - time parsing', () => {
  it('parses "at 3pm"', async () => {
    const result = await parseQuickAdd('Call at 3pm', TEST_USER_ID);
    expect(result.dueTime).toBe('15:00');
  });

  it('parses "at 3:30pm"', async () => {
    const result = await parseQuickAdd('Meeting at 3:30pm', TEST_USER_ID);
    expect(result.dueTime).toBe('15:30');
  });

  it('parses "at 9am"', async () => {
    const result = await parseQuickAdd('Standup at 9am', TEST_USER_ID);
    expect(result.dueTime).toBe('09:00');
  });

  it('parses "at 15:00" (24-hour)', async () => {
    const result = await parseQuickAdd('Call at 15:00', TEST_USER_ID);
    expect(result.dueTime).toBe('15:00');
  });

  it('parses "at 12am" as midnight', async () => {
    const result = await parseQuickAdd('Task at 12am', TEST_USER_ID);
    expect(result.dueTime).toBe('00:00');
  });
});

describe('parseQuickAdd - duration parsing', () => {
  it('parses "for 2h" as 120 minutes', async () => {
    const result = await parseQuickAdd('Focus session for 2h', TEST_USER_ID);
    expect(result.duration).toBe(120);
  });

  it('parses "for 30m" as 30 minutes', async () => {
    const result = await parseQuickAdd('Call for 30m', TEST_USER_ID);
    expect(result.duration).toBe(30);
  });

  it('parses "for 1h30m" as 90 minutes', async () => {
    const result = await parseQuickAdd('Workshop for 1h30m', TEST_USER_ID);
    expect(result.duration).toBe(90);
  });

  it('sets no duration when not specified', async () => {
    const result = await parseQuickAdd('Simple task', TEST_USER_ID);
    expect(result.duration).toBeUndefined();
  });
});

describe('parseQuickAdd - recurring parsing', () => {
  it('parses "every day"', async () => {
    const result = await parseQuickAdd('Stand-up every day', TEST_USER_ID);
    expect(result.isRecurring).toBe(true);
    expect(result.recurrenceRule).toBe('FREQ=DAILY;INTERVAL=1');
  });

  it('parses "every week"', async () => {
    const result = await parseQuickAdd('Review every week', TEST_USER_ID);
    expect(result.isRecurring).toBe(true);
    expect(result.recurrenceRule).toBe('FREQ=WEEKLY;INTERVAL=1');
  });

  it('parses "every Monday"', async () => {
    const result = await parseQuickAdd('Team sync every Monday', TEST_USER_ID);
    expect(result.isRecurring).toBe(true);
    expect(result.recurrenceRule).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO');
  });

  it('parses "every 2 weeks"', async () => {
    const result = await parseQuickAdd('Review every 2 weeks', TEST_USER_ID);
    expect(result.isRecurring).toBe(true);
    expect(result.recurrenceRule).toBe('FREQ=WEEKLY;INTERVAL=2');
  });

  it('sets isRecurring false when no recurrence', async () => {
    const result = await parseQuickAdd('One-time task', TEST_USER_ID);
    expect(result.isRecurring).toBeUndefined();
  });
});

describe('parseQuickAdd - project parsing', () => {
  it('looks up project by name and sets projectId', async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: 'proj-work-123' });
    const result = await parseQuickAdd('Task #Work', TEST_USER_ID);
    expect(result.projectId).toBe('proj-work-123');
    expect(result.content).toBe('Task');
  });

  it('sets no projectId when project not found', async () => {
    mockPrisma.project.findFirst.mockResolvedValue(null);
    const result = await parseQuickAdd('Task #NonExistent', TEST_USER_ID);
    expect(result.projectId).toBeUndefined();
  });
});

describe('parseQuickAdd - label parsing', () => {
  it('extracts label names and resolves to IDs', async () => {
    mockPrisma.label.findMany.mockResolvedValue([{ id: 'label-1' }, { id: 'label-2' }]);
    const result = await parseQuickAdd('Task @urgent @work', TEST_USER_ID);
    expect(result.labelIds).toEqual(['label-1', 'label-2']);
  });

  it('sets no labelIds when labels not found', async () => {
    mockPrisma.label.findMany.mockResolvedValue([]);
    const result = await parseQuickAdd('Task @unknown', TEST_USER_ID);
    expect(result.labelIds).toBeUndefined();
  });
});

describe('parseQuickAdd - combined parsing', () => {
  it('parses a complex task string', async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: 'proj-1' });
    mockPrisma.label.findMany.mockResolvedValue([{ id: 'label-1' }]);

    const result = await parseQuickAdd(
      'Team sync #Work @important p2 today at 10am every week',
      TEST_USER_ID,
    );

    expect(result.content).toBe('Team sync');
    expect(result.priority).toBe(2);
    expect(result.dueDate).toBe('2024-01-04');
    expect(result.dueTime).toBe('10:00');
    expect(result.isRecurring).toBe(true);
    expect(result.projectId).toBe('proj-1');
    expect(result.labelIds).toEqual(['label-1']);
  });
});
