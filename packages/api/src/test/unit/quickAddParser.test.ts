import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database.js', () => ({
  prisma: {
    label: { findMany: vi.fn() },
    project: {
      findMany: vi.fn(async () => []),
      // The project the task lands in: personal, so its owner's labels apply.
      findUnique: vi.fn(async () => ({ workspaceId: null, ownerId: 'user-test' })),
    },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('../../services/access.js', () => ({ findProjectByName: vi.fn(), projectAccessWhere: vi.fn(() => ({})) }));
// Known label names come from the same mocked rows as the space's labels.
vi.mock('../../services/labelService.js', async () => {
  const { prisma } = await import('../../config/database.js');
  return { getLabels: vi.fn(() => prisma.label.findMany()) };
});

// The people who can be assigned in the project the task lands in.
const people = vi.hoisted(() => ({ list: [] as { id: string; name: string; email: string | null; avatarUrl: null }[] }));
vi.mock('../../services/projectService.js', () => ({ getProjectMembers: vi.fn(async () => people.list) }));

/** Where a quick-added task lands when the text names no project. */
const INBOX = 'inbox-1';

import { matchPerson, parseQuickAdd } from '../../utils/quickAddParser.js';
import { findProjectByName } from '../../services/access.js';
import { prisma } from '../../config/database.js';

const mockPrisma = prisma as unknown as {
  label: { findMany: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
};

const mockFindProject = vi.mocked(findProjectByName);

const TEST_USER_ID = 'user-test';

// Fix date to Thursday 2024-01-04T12:00:00Z for predictable day-of-week results
const FIXED_DATE = new Date('2024-01-04T12:00:00.000Z');

beforeEach(() => {
  people.list = [];
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_DATE);
  mockFindProject.mockResolvedValue(null);
  mockPrisma.label.findMany.mockResolvedValue([]);
  mockPrisma.user.findUnique.mockResolvedValue({ timezone: 'UTC' });
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

  it('ignores punctuation attached to words ("Ship it!" is not a priority)', async () => {
    const result = await parseQuickAdd('Ship it!', TEST_USER_ID);
    expect(result.priority).toBeUndefined();
    expect(result.content).toBe('Ship it!');
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

  it('computes "today" on the user\'s wall clock, not the server\'s', async () => {
    // 23:30 UTC on the 15th is already June 16 in Auckland (UTC+12). The old
    // code truncated in server time, so "today" became yesterday for any user
    // east of the server — tasks were born overdue.
    vi.setSystemTime(new Date('2024-06-15T23:30:00.000Z'));
    mockPrisma.user.findUnique.mockResolvedValue({ timezone: 'Pacific/Auckland' });

    const result = await parseQuickAdd('Ship the release today', TEST_USER_ID);
    expect(result.dueDate).toBe('2024-06-16');
  });

  it('an invalid stored timezone falls back to UTC instead of crashing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ timezone: 'Not/AZone' });
    const result = await parseQuickAdd('Ship it today', TEST_USER_ID);
    expect(result.dueDate).toBe('2024-01-04');
  });

  it('"next week" from a Sunday is the next day (Monday), not a week later', async () => {
    // 2024-01-07 is a Sunday.
    vi.setSystemTime(new Date('2024-01-07T12:00:00.000Z'));
    const result = await parseQuickAdd('Plan sprint next week', TEST_USER_ID);
    expect(result.dueDate).toBe('2024-01-08');
  });

  it('reads a month and day that fall today as today, not next year', async () => {
    // Midday on Jan 4: "Jan 4" resolves to midnight, which is earlier than now.
    const result = await parseQuickAdd('Pay rent Jan 4', TEST_USER_ID);
    expect(result.dueDate).toBe('2024-01-04');
  });

  it('rolls a month and day already past this year into next year', async () => {
    const result = await parseQuickAdd('Renew insurance Jan 3', TEST_USER_ID);
    expect(result.dueDate).toBe('2025-01-03');
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
    mockFindProject.mockResolvedValue({ id: 'proj-work-123' } as never);
    const result = await parseQuickAdd('Task #Work', TEST_USER_ID);
    expect(result.projectId).toBe('proj-work-123');
    expect(result.content).toBe('Task');
    expect(mockFindProject).toHaveBeenCalledWith(TEST_USER_ID, 'Work', { minLevel: 'EDIT' });
  });

  it('sets no projectId when project not found', async () => {
    mockFindProject.mockResolvedValue(null);
    const result = await parseQuickAdd('Task #NonExistent', TEST_USER_ID);
    expect(result.projectId).toBeUndefined();
    // An unmatched #tag is ordinary text, not silently deleted.
    expect(result.content).toBe('Task #NonExistent');
  });

  it('ignores a # inside a word', async () => {
    const result = await parseQuickAdd('Fix issue#42', TEST_USER_ID);
    expect(mockFindProject).not.toHaveBeenCalled();
    expect(result.content).toBe('Fix issue#42');
  });
});

describe('parseQuickAdd - label parsing', () => {
  it('keeps an unknown @label in the task text instead of dropping it', async () => {
    mockPrisma.label.findMany.mockResolvedValue([{ id: 'l1', name: 'phone' }]);
    const result = await parseQuickAdd('Call @phone about @unknownthing', TEST_USER_ID, INBOX);
    expect(result.labelIds).toEqual(['l1']);
    expect(result.content).toBe('Call about @unknownthing');
  });

  it('extracts label names and resolves to IDs', async () => {
    mockPrisma.label.findMany.mockResolvedValue([
      { id: 'label-1', name: 'urgent' },
      { id: 'label-2', name: 'work' },
    ]);
    const result = await parseQuickAdd('Task @urgent @work', TEST_USER_ID, INBOX);
    expect(result.labelIds).toEqual(['label-1', 'label-2']);
  });

  it('matches labels case-insensitively', async () => {
    mockPrisma.label.findMany.mockResolvedValue([{ id: 'label-9', name: 'Work' }]);
    const result = await parseQuickAdd('Review deck @work', TEST_USER_ID, INBOX);
    expect(result.labelIds).toEqual(['label-9']);
  });

  it('sets no labelIds when labels not found', async () => {
    mockPrisma.label.findMany.mockResolvedValue([]);
    const result = await parseQuickAdd('Task @unknown', TEST_USER_ID, INBOX);
    expect(result.labelIds).toBeUndefined();
  });
});

describe('parseQuickAdd - combined parsing', () => {
  it('parses a complex task string', async () => {
    mockFindProject.mockResolvedValue({ id: 'proj-1' } as never);
    mockPrisma.label.findMany.mockResolvedValue([{ id: 'label-1', name: 'important' }]);

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

describe('parseQuickAdd - assignee', () => {
  const person = (id: string, name: string) => ({ id, name, email: null, avatarUrl: null });

  it('assigns +name to someone in the project, including multi-word names', async () => {
    people.list = [person('u1', 'Sam Smith'), person('u2', 'Ada Lovelace')];
    const result = await parseQuickAdd('Review deck +Sam Smith tomorrow', TEST_USER_ID, INBOX);
    expect(result.assigneeId).toBe('u1');
    expect(result.content).toBe('Review deck');
  });

  it('keeps +name in the text when it names nobody there', async () => {
    people.list = [person('u2', 'Ada Lovelace')];
    const result = await parseQuickAdd('Ask +Zed about it', TEST_USER_ID, INBOX);
    expect(result.assigneeId).toBeUndefined();
    expect(result.content).toBe('Ask +Zed about it');
  });
});

describe('matchPerson', () => {
  const people = [
    { id: 'me', name: 'Ada Lovelace' },
    { id: 'u1', name: 'Sam Smith' },
    { id: 'u2', name: 'Sam Jones' },
    { id: 'u3', name: 'Grace Hopper' },
  ];
  it('takes +me, a full name in any case, or a first name only one person has', () => {
    expect(matchPerson('me', people, 'me')).toBe('me');
    expect(matchPerson('sam jones', people, 'me')).toBe('u2');
    expect(matchPerson('Grace', people, 'me')).toBe('u3');
  });
  it('refuses an ambiguous first name, or +me outside the project', () => {
    expect(matchPerson('Sam', people, 'me')).toBeNull();
    expect(matchPerson('me', people, 'stranger')).toBeNull();
  });
});
