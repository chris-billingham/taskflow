import { describe, it, expect } from 'vitest';
import {
  parseRecurrenceText,
  getNextOccurrence,
  advanceRecurrenceRule,
} from '../../utils/recurrence.js';

// Most cases expect an occurrence; null (series ended) is asserted explicitly.
function nextOf(rule: string, from: Date): Date {
  const next = getNextOccurrence(rule, from);
  if (!next) throw new Error(`expected an occurrence for ${rule}`);
  return next;
}

describe('parseRecurrenceText', () => {
  it.each([
    ['every day', 'FREQ=DAILY;INTERVAL=1'],
    ['every 2 days', 'FREQ=DAILY;INTERVAL=2'],
    ['every week', 'FREQ=WEEKLY;INTERVAL=1'],
    ['every 2 weeks', 'FREQ=WEEKLY;INTERVAL=2'],
    ['every month', 'FREQ=MONTHLY;INTERVAL=1'],
    ['every 3 months', 'FREQ=MONTHLY;INTERVAL=3'],
    ['every year', 'FREQ=YEARLY;INTERVAL=1'],
    ['every 2 years', 'FREQ=YEARLY;INTERVAL=2'],
    ['every Monday', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO'],
    ['every Tuesday', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU'],
    ['every Wednesday', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=WE'],
    ['every Thursday', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TH'],
    ['every Friday', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=FR'],
    ['every Saturday', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=SA'],
    ['every Sunday', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=SU'],
    ['every weekday', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR'],
  ] as [string, string][])('parses "%s"', (input, expected) => {
    expect(parseRecurrenceText(input)).toBe(expected);
  });

  it('is case-insensitive for period keywords', () => {
    expect(parseRecurrenceText('Every Day')).toBe('FREQ=DAILY;INTERVAL=1');
    expect(parseRecurrenceText('EVERY WEEK')).toBe('FREQ=WEEKLY;INTERVAL=1');
  });

  it('is case-insensitive for day names', () => {
    expect(parseRecurrenceText('every MONDAY')).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO');
  });

  it('returns default daily for unrecognized patterns', () => {
    expect(parseRecurrenceText('some random text')).toBe('FREQ=DAILY;INTERVAL=1');
    expect(parseRecurrenceText('')).toBe('FREQ=DAILY;INTERVAL=1');
  });

  it('handles plural and singular forms', () => {
    expect(parseRecurrenceText('every 1 day')).toBe('FREQ=DAILY;INTERVAL=1');
    expect(parseRecurrenceText('every 1 week')).toBe('FREQ=WEEKLY;INTERVAL=1');
  });
});

describe('getNextOccurrence', () => {
  // 2024-01-01T12:00:00Z is a Monday
  const monday = new Date('2024-01-01T12:00:00.000Z');

  it('adds 1 day for DAILY;INTERVAL=1', () => {
    const next = nextOf('FREQ=DAILY;INTERVAL=1', monday);
    const diff = next.getTime() - monday.getTime();
    expect(diff).toBe(24 * 60 * 60 * 1000);
  });

  it('adds 2 days for DAILY;INTERVAL=2', () => {
    const next = nextOf('FREQ=DAILY;INTERVAL=2', monday);
    const diff = next.getTime() - monday.getTime();
    expect(diff).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('adds 7 days for WEEKLY;INTERVAL=1 without BYDAY', () => {
    const next = nextOf('FREQ=WEEKLY;INTERVAL=1', monday);
    const diff = next.getTime() - monday.getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('adds 14 days for WEEKLY;INTERVAL=2 without BYDAY', () => {
    const next = nextOf('FREQ=WEEKLY;INTERVAL=2', monday);
    const diff = next.getTime() - monday.getTime();
    expect(diff).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('advances to next Tuesday from Monday with BYDAY=TU', () => {
    const next = nextOf('FREQ=WEEKLY;INTERVAL=1;BYDAY=TU', monday);
    const diff = next.getTime() - monday.getTime();
    expect(diff).toBe(1 * 24 * 60 * 60 * 1000); // +1 day
  });

  it('advances to next Friday from Monday with BYDAY=FR', () => {
    const next = nextOf('FREQ=WEEKLY;INTERVAL=1;BYDAY=FR', monday);
    const diff = next.getTime() - monday.getTime();
    expect(diff).toBe(4 * 24 * 60 * 60 * 1000); // +4 days (Mon -> Fri)
  });

  it('wraps around to next Monday from Monday with BYDAY=MO (adds 7 days)', () => {
    const next = nextOf('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO', monday);
    const diff = next.getTime() - monday.getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000); // next Monday
  });

  it('finds nearest day with multiple BYDAY targets', () => {
    // From Monday, BYDAY=MO,TU,WE,TH,FR: nearest is Tuesday (+1)
    const next = nextOf('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR', monday);
    const diff = next.getTime() - monday.getTime();
    expect(diff).toBe(1 * 24 * 60 * 60 * 1000);
  });

  it('adds 1 month for MONTHLY;INTERVAL=1', () => {
    const next = nextOf('FREQ=MONTHLY;INTERVAL=1', monday);
    expect(next.getMonth()).toBe(monday.getMonth() + 1);
    expect(next.getDate()).toBe(monday.getDate());
  });

  it('adds 3 months for MONTHLY;INTERVAL=3', () => {
    const next = nextOf('FREQ=MONTHLY;INTERVAL=3', monday);
    expect(next.getMonth()).toBe(monday.getMonth() + 3);
  });

  it('adds 1 year for YEARLY;INTERVAL=1', () => {
    const next = nextOf('FREQ=YEARLY;INTERVAL=1', monday);
    expect(next.getFullYear()).toBe(2025);
    expect(next.getMonth()).toBe(monday.getMonth());
    expect(next.getDate()).toBe(monday.getDate());
  });

  it('clamps Jan 31 + 1 month to the last day of February (no overflow to March)', () => {
    const jan31 = new Date(2024, 0, 31, 9, 0, 0); // local time; 2024 is a leap year
    const next = nextOf('FREQ=MONTHLY;INTERVAL=1', jan31);
    expect(next.getMonth()).toBe(1); // February, not March
    expect(next.getDate()).toBe(29); // leap-year Feb has 29 days
  });

  it('clamps Jan 31 + 1 month to Feb 28 in a non-leap year', () => {
    const jan31 = new Date(2025, 0, 31, 9, 0, 0);
    const next = nextOf('FREQ=MONTHLY;INTERVAL=1', jan31);
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(28);
  });

  it('clamps May 31 + 1 month to June 30', () => {
    const may31 = new Date(2024, 4, 31, 9, 0, 0);
    const next = nextOf('FREQ=MONTHLY;INTERVAL=1', may31);
    expect(next.getMonth()).toBe(5); // June
    expect(next.getDate()).toBe(30);
  });

  it('clamps Feb 29 + 1 year to Feb 28 in the following (non-leap) year', () => {
    const feb29 = new Date(2024, 1, 29, 9, 0, 0);
    const next = nextOf('FREQ=YEARLY;INTERVAL=1', feb29);
    expect(next.getFullYear()).toBe(2025);
    expect(next.getMonth()).toBe(1); // still February
    expect(next.getDate()).toBe(28);
  });

  it('preserves the time component', () => {
    const next = nextOf('FREQ=DAILY;INTERVAL=1', monday);
    expect(next.getHours()).toBe(monday.getHours());
    expect(next.getMinutes()).toBe(monday.getMinutes());
    expect(next.getSeconds()).toBe(monday.getSeconds());
  });
});

describe('INTERVAL with BYDAY', () => {
  // Thursday 2024-01-04
  const thursday = new Date(2024, 0, 4, 9, 0, 0);

  it('every-2-weeks-on-Monday skips the intervening Monday', () => {
    // Next Monday after Thu Jan 4 is Jan 8; biweekly must land on Jan 15.
    const next = nextOf('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', thursday);
    expect(next.getDate()).toBe(15);
    expect(next.getDay()).toBe(1);
  });

  it('interval does not skip weekdays within the same week', () => {
    // From Thu, BYDAY=MO,FR: Friday is in the SAME week — no interval skip.
    const next = nextOf('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR', thursday);
    expect(next.getDay()).toBe(5);
    expect(next.getDate()).toBe(5);
  });

  it('interval 1 keeps firing every matching weekday', () => {
    const next = nextOf('FREQ=WEEKLY;INTERVAL=1;BYDAY=TH', thursday);
    expect(next.getDate()).toBe(11); // the following Thursday
  });
});

describe('COUNT and UNTIL termination', () => {
  const monday = new Date(2024, 0, 8, 9, 0, 0);

  it('COUNT=1 means this was the final occurrence', () => {
    expect(getNextOccurrence('FREQ=DAILY;INTERVAL=1;COUNT=1', monday)).toBeNull();
  });

  it('COUNT>1 continues and advanceRecurrenceRule decrements it', () => {
    expect(getNextOccurrence('FREQ=DAILY;INTERVAL=1;COUNT=3', monday)).not.toBeNull();
    expect(advanceRecurrenceRule('FREQ=DAILY;INTERVAL=1;COUNT=3')).toBe(
      'FREQ=DAILY;INTERVAL=1;COUNT=2',
    );
    expect(advanceRecurrenceRule('FREQ=DAILY;INTERVAL=1')).toBe('FREQ=DAILY;INTERVAL=1');
  });

  it('UNTIL in basic format ends the series', () => {
    expect(
      getNextOccurrence('FREQ=DAILY;INTERVAL=1;UNTIL=20240108', monday),
    ).toBeNull();
    const next = getNextOccurrence('FREQ=DAILY;INTERVAL=1;UNTIL=20240120', monday);
    expect(next?.getDate()).toBe(9);
  });

  it('UNTIL as an ISO date also works', () => {
    expect(
      getNextOccurrence('FREQ=WEEKLY;INTERVAL=1;UNTIL=2024-01-10', monday),
    ).toBeNull();
  });
});

/**
 * Occurrence arithmetic on the date shape production actually passes.
 *
 * completeTask() calls getNextOccurrence with `task.dueDate`, which is a
 * CALENDAR date stored as UTC midnight (see utils/dates.ts). The cases above
 * use midday-UTC instants, which stay on the same local date in every zone the
 * CI and containers run in — so they pass whatever the host timezone is, and
 * cannot see local-time date math. These pin exact UTC instants from a
 * UTC-midnight base, which is where the host's offset actually bites.
 *
 * Run under `TZ=America/New_York` as well as UTC: a regression here is
 * invisible in UTC.
 */
describe('getNextOccurrence — UTC-midnight due dates', () => {
  const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const nextIso = (rule: string, from: string) => nextOf(rule, at(from)).toISOString();

  it('advances a daily rule by exactly one calendar day', () => {
    // 2026-07-26 is a Sunday.
    expect(nextIso('FREQ=DAILY;INTERVAL=1', '2026-07-26')).toBe('2026-07-27T00:00:00.000Z');
  });

  it('advances a daily rule across a DST spring-forward without drifting', () => {
    // US DST begins 2026-03-08. A host in that zone loses an hour mid-step.
    expect(nextIso('FREQ=DAILY;INTERVAL=1', '2026-03-08')).toBe('2026-03-09T00:00:00.000Z');
  });

  it('advances a daily rule across a DST fall-back without drifting', () => {
    // US DST ends 2026-11-01.
    expect(nextIso('FREQ=DAILY;INTERVAL=1', '2026-11-01')).toBe('2026-11-02T00:00:00.000Z');
  });

  it('resolves BYDAY against the date\'s own weekday, not the host\'s', () => {
    // Sunday 2026-07-26 -> the following Monday is the 27th. Read in a
    // behind-UTC zone the base looks like Saturday, which lands on the 28th.
    expect(nextIso('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO', '2026-07-26')).toBe(
      '2026-07-27T00:00:00.000Z',
    );
  });

  it('wraps a same-weekday BYDAY rule by a full week', () => {
    // Monday 2026-07-27 with BYDAY=MO -> next Monday, the 3rd.
    expect(nextIso('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO', '2026-07-27')).toBe(
      '2026-08-03T00:00:00.000Z',
    );
  });

  it('never lands a weekday-only rule on a weekend', () => {
    // Friday 2026-07-31 with the weekday set -> Monday the 3rd. Off-by-one
    // weekday resolution puts this on Saturday the 1st, which the rule excludes.
    const next = nextOf('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR', at('2026-07-31'));
    expect(next.toISOString()).toBe('2026-08-03T00:00:00.000Z');
    expect(next.getUTCDay()).not.toBe(0);
    expect(next.getUTCDay()).not.toBe(6);
  });

  it('honours INTERVAL on a fortnightly BYDAY rule', () => {
    // Monday 2026-07-27, every 2 weeks on Monday -> 2026-08-10.
    expect(nextIso('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', '2026-07-27')).toBe(
      '2026-08-10T00:00:00.000Z',
    );
  });

  it('adds whole weeks for a weekly rule with no BYDAY', () => {
    expect(nextIso('FREQ=WEEKLY;INTERVAL=1', '2026-07-26')).toBe('2026-08-02T00:00:00.000Z');
  });

  it('clamps a month-end monthly rule to the shorter month', () => {
    // Jan 31 + 1 month -> Feb 28 (2026 is not a leap year).
    expect(nextIso('FREQ=MONTHLY;INTERVAL=1', '2026-01-31')).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });

  it('advances a mid-month monthly rule to the same day', () => {
    expect(nextIso('FREQ=MONTHLY;INTERVAL=1', '2026-07-15')).toBe(
      '2026-08-15T00:00:00.000Z',
    );
  });

  it('advances a monthly rule across a DST boundary', () => {
    expect(nextIso('FREQ=MONTHLY;INTERVAL=1', '2026-03-15')).toBe(
      '2026-04-15T00:00:00.000Z',
    );
  });

  it('clamps a Feb-29 yearly rule into a non-leap year', () => {
    expect(nextIso('FREQ=YEARLY;INTERVAL=1', '2028-02-29')).toBe(
      '2029-02-28T00:00:00.000Z',
    );
  });

  it('advances a yearly rule to the same calendar date', () => {
    expect(nextIso('FREQ=YEARLY;INTERVAL=1', '2026-07-26')).toBe(
      '2027-07-26T00:00:00.000Z',
    );
  });
});
