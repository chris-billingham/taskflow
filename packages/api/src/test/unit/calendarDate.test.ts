import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { calendarDate, calendarDateInput, createTaskSchema } from '@taskflow/contract';

describe('calendarDate', () => {
  it('goes over the wire as YYYY-MM-DD and is a UTC-midnight Date on the server', () => {
    const day = new Date('2026-09-27T00:00:00.000Z');
    expect(z.encode(calendarDate, day)).toBe('2026-09-27');
    expect(z.decode(calendarDate, '2026-09-27')).toEqual(day);
  });

  it('rejects anything that is not a date', () => {
    expect(() => z.decode(calendarDate, '2026-09-27T10:00:00Z')).toThrow();
  });
});

describe('calendarDateInput', () => {
  it('takes YYYY-MM-DD, and reads a timestamp as the date it was written on', () => {
    expect(calendarDateInput.parse('2026-09-27')).toBe('2026-09-27');
    expect(calendarDateInput.parse('2026-09-27T23:30:00-05:00')).toBe('2026-09-27');
  });

  it('refuses impossible or malformed dates', () => {
    expect(calendarDateInput.safeParse('2026-02-30').success).toBe(false);
    expect(calendarDateInput.safeParse('tomorrow').success).toBe(false);
  });

  it('is what task requests use', () => {
    const parsed = createTaskSchema.parse({ content: 'x', projectId: 'p', dueDate: '2026-09-27T09:00:00.000Z' });
    expect(parsed.dueDate).toBe('2026-09-27');
  });
});
