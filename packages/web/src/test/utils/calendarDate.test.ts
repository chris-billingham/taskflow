import { describe, it, expect } from 'vitest';
import { parseCalendarDate } from '@/utils/calendarDate';

describe('parseCalendarDate', () => {
  it('is local midnight of that day, whatever the timezone', () => {
    const date = parseCalendarDate('2026-09-27');
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 8, 27, 0]);
  });

  it('accepts an older full timestamp by its date part', () => {
    expect(parseCalendarDate('2026-09-27T00:00:00.000Z').getDate()).toBe(27);
  });
});
