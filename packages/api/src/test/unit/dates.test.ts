import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

import {
  isValidTimeZone,
  userDayBoundariesUTC,
  zonedWallClockToUTC,
} from '../../utils/dates.js';

/**
 * A task's dueTime ("09:00") is a wall-clock reading in the owner's timezone,
 * while its dueDate is a calendar date encoded as UTC midnight. Turning the
 * pair into a real instant is the one place reminders can silently fire hours
 * early or late, so the offset and DST cases are pinned explicitly.
 */
describe('zonedWallClockToUTC', () => {
  const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it('is identity for UTC', () => {
    expect(zonedWallClockToUTC(date('2026-07-26'), '09:30', 'UTC').toISOString()).toBe(
      '2026-07-26T09:30:00.000Z',
    );
  });

  it('subtracts a positive offset (Europe/London, BST = UTC+1)', () => {
    expect(
      zonedWallClockToUTC(date('2026-07-26'), '09:00', 'Europe/London').toISOString(),
    ).toBe('2026-07-26T08:00:00.000Z');
  });

  it('applies the winter offset for the same zone (GMT = UTC+0)', () => {
    expect(
      zonedWallClockToUTC(date('2026-01-15'), '09:00', 'Europe/London').toISOString(),
    ).toBe('2026-01-15T09:00:00.000Z');
  });

  it('adds a negative offset (America/New_York, EDT = UTC-4)', () => {
    expect(
      zonedWallClockToUTC(date('2026-07-26'), '09:00', 'America/New_York').toISOString(),
    ).toBe('2026-07-26T13:00:00.000Z');
  });

  it('handles a half-hour offset (Asia/Kolkata, UTC+5:30)', () => {
    expect(
      zonedWallClockToUTC(date('2026-07-26'), '09:00', 'Asia/Kolkata').toISOString(),
    ).toBe('2026-07-26T03:30:00.000Z');
  });

  it('crosses the date line backwards (Australia/Sydney, AEST = UTC+10)', () => {
    // 09:00 on the 27th in Sydney is still the 26th in UTC.
    expect(
      zonedWallClockToUTC(date('2026-07-27'), '09:00', 'Australia/Sydney').toISOString(),
    ).toBe('2026-07-26T23:00:00.000Z');
  });

  it('resolves a time on the spring-forward day after the transition', () => {
    // London springs forward at 01:00 GMT on 2026-03-29; 09:00 is BST (UTC+1).
    expect(
      zonedWallClockToUTC(date('2026-03-29'), '09:00', 'Europe/London').toISOString(),
    ).toBe('2026-03-29T08:00:00.000Z');
  });

  it('resolves a time on the autumn-back day after the transition', () => {
    // London falls back at 02:00 BST on 2026-10-25; 09:00 is GMT (UTC+0).
    expect(
      zonedWallClockToUTC(date('2026-10-25'), '09:00', 'Europe/London').toISOString(),
    ).toBe('2026-10-25T09:00:00.000Z');
  });

  it('treats a malformed time as midnight rather than producing an Invalid Date', () => {
    const result = zonedWallClockToUTC(date('2026-07-26'), 'not-a-time', 'UTC');
    expect(Number.isNaN(result.getTime())).toBe(false);
    expect(result.toISOString()).toBe('2026-07-26T00:00:00.000Z');
  });
});

describe('userDayBoundariesUTC', () => {
  it('uses the user\'s calendar day, not the host\'s', () => {
    // 02:00 UTC on the 26th is still the 25th in Los Angeles.
    const { todayStart, tomorrowStart } = userDayBoundariesUTC(
      'America/Los_Angeles',
      new Date('2026-07-26T02:00:00.000Z'),
    );
    expect(todayStart.toISOString()).toBe('2026-07-25T00:00:00.000Z');
    expect(tomorrowStart.toISOString()).toBe('2026-07-26T00:00:00.000Z');
  });

  it('rolls to the next day east of UTC', () => {
    const { todayStart } = userDayBoundariesUTC(
      'Asia/Tokyo',
      new Date('2026-07-26T16:00:00.000Z'),
    );
    expect(todayStart.toISOString()).toBe('2026-07-27T00:00:00.000Z');
  });
});

describe('isValidTimeZone', () => {
  it.each(['UTC', 'Europe/London', 'America/New_York', 'Asia/Kolkata'])(
    'accepts %s',
    (tz) => {
      expect(isValidTimeZone(tz)).toBe(true);
    },
  );

  it.each(['Not/AZone', 'nonsense', ''])('rejects %s', (tz) => {
    expect(isValidTimeZone(tz)).toBe(false);
  });
});
