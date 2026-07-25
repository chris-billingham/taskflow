import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database.js', () => ({
  prisma: {
    project: { findFirst: vi.fn() },
    label: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}));

import { validateFilterQuery, parseFilterQuery } from '../../utils/filterParser.js';
import { prisma } from '../../config/database.js';

const mockPrisma = prisma as unknown as {
  project: { findFirst: ReturnType<typeof vi.fn> };
  label: { findFirst: ReturnType<typeof vi.fn> };
  user: { findFirst: ReturnType<typeof vi.fn> };
};

const TEST_USER_ID = 'user-123';

describe('validateFilterQuery', () => {
  it('validates single priority atom', () => {
    expect(validateFilterQuery('p1')).toEqual({ valid: true });
  });

  it('validates date atom', () => {
    expect(validateFilterQuery('today')).toEqual({ valid: true });
  });

  it('validates AND expression', () => {
    expect(validateFilterQuery('p1 & today')).toEqual({ valid: true });
  });

  it('validates OR expression', () => {
    expect(validateFilterQuery('p1 | p2')).toEqual({ valid: true });
  });

  it('validates NOT expression using ! prefix', () => {
    expect(validateFilterQuery('!completed')).toEqual({ valid: true });
  });

  it('validates parenthesized expression', () => {
    expect(validateFilterQuery('(p1 | p2) & today')).toEqual({ valid: true });
  });

  it('validates negated project atom', () => {
    expect(validateFilterQuery('!#Work')).toEqual({ valid: true });
  });

  it('rejects empty query', () => {
    expect(validateFilterQuery('')).toEqual({ valid: false, error: 'Query is empty' });
  });

  it('rejects unmatched opening parenthesis', () => {
    const result = validateFilterQuery('(p1 & today');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Unmatched opening parenthesis');
  });

  it('rejects unmatched closing parenthesis', () => {
    const result = validateFilterQuery('p1) & today');
    expect(result.valid).toBe(false);
  });

  it('rejects query starting with AND operator', () => {
    const result = validateFilterQuery('& p1');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Query cannot start with an operator');
  });

  it('rejects query starting with OR operator', () => {
    const result = validateFilterQuery('| p1');
    expect(result.valid).toBe(false);
  });

  it('rejects query ending with AND operator', () => {
    const result = validateFilterQuery('p1 &');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Query cannot end with an operator');
  });

  it('rejects query ending with OR operator', () => {
    const result = validateFilterQuery('p1 |');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Query cannot end with an operator');
  });

  it('rejects consecutive operators', () => {
    const result = validateFilterQuery('p1 & & p2');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Consecutive operators are not allowed');
  });
});

describe('parseFilterQuery', () => {
  beforeEach(() => {
    mockPrisma.project.findFirst.mockResolvedValue(null);
    mockPrisma.label.findFirst.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue(null);
  });

  it('returns empty object for empty query', async () => {
    const result = await parseFilterQuery('', TEST_USER_ID);
    expect(result).toEqual({});
  });

  it.each([
    ['p1', { priority: 1 }],
    ['p2', { priority: 2 }],
    ['p3', { priority: 3 }],
    ['p4', { priority: 4 }],
    ['priority 1', { priority: 1 }],
    ['priority 4', { priority: 4 }],
  ] as [string, object][])('parses priority "%s"', async (query, expected) => {
    const result = await parseFilterQuery(query, TEST_USER_ID);
    expect(result).toEqual(expected);
  });

  it('parses "today" with date range and isCompleted: false', async () => {
    const result = await parseFilterQuery('today', TEST_USER_ID);
    expect(result).toMatchObject({ isCompleted: false });
    expect((result.dueDate as Record<string, Date>)?.gte).toBeInstanceOf(Date);
    expect((result.dueDate as Record<string, Date>)?.lte).toBeInstanceOf(Date);
  });

  it('parses "tomorrow" with next day range', async () => {
    const result = await parseFilterQuery('tomorrow', TEST_USER_ID);
    expect(result).toMatchObject({ isCompleted: false });
    const dueDate = result.dueDate as Record<string, Date>;
    expect(dueDate?.gte).toBeInstanceOf(Date);
    // tomorrow's date should be after today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(dueDate.gte.getTime()).toBeGreaterThan(today.getTime());
  });

  it('parses "overdue" with dueDate.lt and isCompleted: false', async () => {
    const result = await parseFilterQuery('overdue', TEST_USER_ID);
    expect(result).toMatchObject({ isCompleted: false });
    expect((result.dueDate as Record<string, Date>)?.lt).toBeInstanceOf(Date);
  });

  it('parses "no date"', async () => {
    const result = await parseFilterQuery('no date', TEST_USER_ID);
    expect(result).toEqual({ dueDate: null, isCompleted: false });
  });

  it('parses "recurring"', async () => {
    expect(await parseFilterQuery('recurring', TEST_USER_ID)).toEqual({ isRecurring: true });
  });

  it('parses "!recurring"', async () => {
    expect(await parseFilterQuery('!recurring', TEST_USER_ID)).toEqual({ isRecurring: false });
  });

  it('parses "completed"', async () => {
    expect(await parseFilterQuery('completed', TEST_USER_ID)).toEqual({ isCompleted: true });
  });

  it('parses "!completed"', async () => {
    expect(await parseFilterQuery('!completed', TEST_USER_ID)).toEqual({ isCompleted: false });
  });

  it('parses "subtask"', async () => {
    expect(await parseFilterQuery('subtask', TEST_USER_ID)).toEqual({ parentId: { not: null } });
  });

  it('parses "!subtask"', async () => {
    expect(await parseFilterQuery('!subtask', TEST_USER_ID)).toEqual({ parentId: null });
  });

  it('wraps two clauses in AND', async () => {
    const result = await parseFilterQuery('p1 & !completed', TEST_USER_ID);
    expect(result).toHaveProperty('AND');
    expect((result.AND as unknown[]).length).toBe(2);
  });

  it('wraps two clauses in OR', async () => {
    const result = await parseFilterQuery('p1 | p2', TEST_USER_ID);
    expect(result).toHaveProperty('OR');
    const clauses = result.OR as object[];
    expect(clauses).toHaveLength(2);
    expect(clauses[0]).toEqual({ priority: 1 });
    expect(clauses[1]).toEqual({ priority: 2 });
  });

  it('wraps in NOT for ! prefix operator', async () => {
    const result = await parseFilterQuery('!p1', TEST_USER_ID);
    expect(result).toHaveProperty('NOT');
    expect((result.NOT as object)).toEqual({ priority: 1 });
  });

  it('resolves #ProjectName to projectId when project exists', async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: 'proj-456' });
    const result = await parseFilterQuery('#Work', TEST_USER_ID);
    expect(result).toEqual({ projectId: 'proj-456' });
    expect(mockPrisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerId: TEST_USER_ID }),
      }),
    );
  });

  it('matches nothing for an unknown project (not everything)', async () => {
    mockPrisma.project.findFirst.mockResolvedValue(null);
    const result = await parseFilterQuery('#NonExistent', TEST_USER_ID);
    expect(result).toEqual({ id: { in: [] } });
  });

  it('resolves !#ProjectName to not-projectId when project exists', async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: 'proj-789' });
    const result = await parseFilterQuery('!#Work', TEST_USER_ID);
    expect(result).toEqual({ projectId: { not: 'proj-789' } });
  });

  it('resolves @labelname to taskLabels filter when label exists', async () => {
    mockPrisma.label.findFirst.mockResolvedValue({ id: 'label-abc' });
    const result = await parseFilterQuery('@urgent', TEST_USER_ID);
    expect(result).toEqual({ taskLabels: { some: { labelId: 'label-abc' } } });
  });

  it('matches nothing for an unknown label (not everything)', async () => {
    mockPrisma.label.findFirst.mockResolvedValue(null);
    const result = await parseFilterQuery('@unknown', TEST_USER_ID);
    expect(result).toEqual({ id: { in: [] } });
  });

  it('does not widen an OR when one side is an unknown project', async () => {
    // Regression for the OR-with-empty-clause bug: `#Nonexistent | p1` must
    // resolve to just the p1 branch plus a match-nothing branch, never {}.
    mockPrisma.project.findFirst.mockResolvedValue(null);
    const result = await parseFilterQuery('#Nonexistent | p1', TEST_USER_ID);
    const ors = result.OR as Array<Record<string, unknown>>;
    expect(ors).toBeDefined();
    expect(ors).toContainEqual({ id: { in: [] } });
    expect(ors).toContainEqual({ priority: 1 });
  });

  it('parses "assigned to: me"', async () => {
    const result = await parseFilterQuery('assigned to: me', TEST_USER_ID);
    expect(result).toEqual({ assigneeId: TEST_USER_ID });
  });

  it('parses "search: keyword" as content/description OR', async () => {
    const result = await parseFilterQuery('search: meeting', TEST_USER_ID);
    expect(result).toHaveProperty('OR');
    const ors = result.OR as Array<Record<string, unknown>>;
    expect(ors[0]).toHaveProperty('content');
    expect(ors[1]).toHaveProperty('description');
  });

  it('parses "due: today"', async () => {
    const result = await parseFilterQuery('due: today', TEST_USER_ID);
    const dueDate = result.dueDate as Record<string, Date>;
    expect(dueDate?.gte).toBeInstanceOf(Date);
    expect(dueDate?.lte).toBeInstanceOf(Date);
  });

  it('parses "due before: tomorrow"', async () => {
    const result = await parseFilterQuery('due before: tomorrow', TEST_USER_ID);
    expect((result.dueDate as Record<string, Date>)?.lt).toBeInstanceOf(Date);
  });

  it('parses "due after: today"', async () => {
    const result = await parseFilterQuery('due after: today', TEST_USER_ID);
    expect((result.dueDate as Record<string, Date>)?.gt).toBeInstanceOf(Date);
  });

  it('handles nested parentheses: (p1 | p2) & !completed', async () => {
    const result = await parseFilterQuery('(p1 | p2) & !completed', TEST_USER_ID);
    expect(result).toHaveProperty('AND');
    const and = result.AND as object[];
    expect(and).toHaveLength(2);
    // First clause should be the OR of p1 and p2
    expect(and[0]).toHaveProperty('OR');
    // !completed is a recognized ATOM that returns { isCompleted: false } directly
    expect(and[1]).toEqual({ isCompleted: false });
  });

  it('falls back to content/description search for unrecognized atoms', async () => {
    const result = await parseFilterQuery('meeting notes', TEST_USER_ID);
    // "meeting notes" gets tokenized as one atom, treated as search
    const asOr = result.OR as Array<Record<string, unknown>>;
    if (asOr) {
      expect(asOr[0]).toHaveProperty('content');
    } else {
      // single atom fallback
      expect(result).toHaveProperty('OR');
    }
  });
});
