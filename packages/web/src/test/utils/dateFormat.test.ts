import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import {
  formatUserDate,
  formatUserDateTime,
  formatUserDateWithWeekday,
  formatUserTime,
  formatUserTimeCompact,
  formatUserHour,
  userWeekStartsOn,
} from '@/utils/dateFormat';

// 5 January 2026 is a Monday — day and month differ, so a day-first format is
// distinguishable from a month-first one (the bug these tests exist for).
const DATE = new Date(2026, 0, 5, 14, 30);

function signInWith(prefs: {
  dateFormat?: string | null;
  timeFormat?: string | null;
  weekStart?: number;
}) {
  useAuthStore.setState({
    user: {
      id: 'u1',
      email: 'u@example.com',
      name: 'User',
      ...prefs,
    },
    isAuthenticated: true,
    isLoading: false,
  });
}

beforeEach(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
});

describe('formatUserDate', () => {
  it.each([
    ['MMM d, yyyy', 'Jan 5, 2026'],
    ['MM/dd/yyyy', '01/05/2026'],
    ['dd/MM/yyyy', '05/01/2026'],
    ['yyyy-MM-dd', '2026-01-05'],
  ])('renders %s as %s', (dateFormat, expected) => {
    signInWith({ dateFormat });
    expect(formatUserDate(DATE)).toBe(expected);
  });

  it('always includes the year', () => {
    for (const dateFormat of ['MMM d, yyyy', 'MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd']) {
      signInWith({ dateFormat });
      expect(formatUserDate(DATE)).toContain('2026');
    }
  });

  it('renders dd/MM/yyyy numerically, not as a month name', () => {
    // Regression: this preference used to render "5 Jan" — a completely
    // different format from the one the user selected.
    signInWith({ dateFormat: 'dd/MM/yyyy' });
    const result = formatUserDate(DATE);
    expect(result).toBe('05/01/2026');
    expect(result).not.toMatch(/Jan/);
  });

  it('keeps the two numeric formats distinguishable from each other', () => {
    signInWith({ dateFormat: 'dd/MM/yyyy' });
    const dayFirst = formatUserDate(DATE);
    signInWith({ dateFormat: 'MM/dd/yyyy' });
    const monthFirst = formatUserDate(DATE);

    expect(dayFirst).toBe('05/01/2026');
    expect(monthFirst).toBe('01/05/2026');
    expect(dayFirst).not.toBe(monthFirst);
  });

  it('falls back to the default when no preference is set', () => {
    signInWith({ dateFormat: null });
    expect(formatUserDate(DATE)).toBe('Jan 5, 2026');
  });

  it('falls back to the default when signed out', () => {
    expect(formatUserDate(DATE)).toBe('Jan 5, 2026');
  });

  it('falls back rather than throwing on an unrecognised stored format', () => {
    // `User.dateFormat` is free text server-side; an unknown token would make
    // date-fns throw and take down every view that renders a date.
    signInWith({ dateFormat: 'totally bogus Q' });
    expect(() => formatUserDate(DATE)).not.toThrow();
    expect(formatUserDate(DATE)).toBe('Jan 5, 2026');
  });
});

describe('formatUserDateWithWeekday', () => {
  it('prefixes the weekday to the chosen format', () => {
    signInWith({ dateFormat: 'dd/MM/yyyy' });
    expect(formatUserDateWithWeekday(DATE)).toBe('Monday, 05/01/2026');
  });

  it('supports the short weekday style', () => {
    signInWith({ dateFormat: 'MMM d, yyyy' });
    expect(formatUserDateWithWeekday(DATE, 'EEE')).toBe('Mon, Jan 5, 2026');
  });
});

describe('formatUserTime', () => {
  it('renders 24-hour times unchanged', () => {
    signInWith({ timeFormat: '24h' });
    expect(formatUserTime('14:30')).toBe('14:30');
    expect(formatUserTime('00:05')).toBe('00:05');
  });

  it('converts to 12-hour by default', () => {
    signInWith({ timeFormat: '12h' });
    expect(formatUserTime('14:30')).toBe('2:30 PM');
    expect(formatUserTime('00:05')).toBe('12:05 AM');
    expect(formatUserTime('12:00')).toBe('12:00 PM');
  });

  it('returns an empty string for a missing time', () => {
    expect(formatUserTime(null)).toBe('');
    expect(formatUserTime(undefined)).toBe('');
  });

  it('passes through an unparseable value rather than rendering NaN', () => {
    signInWith({ timeFormat: '12h' });
    expect(formatUserTime('not-a-time')).toBe('not-a-time');
  });
});

describe('formatUserTimeCompact', () => {
  it('honours the 24-hour preference', () => {
    // Regression: calendar task chips hardcoded the 12-hour form, so picking
    // 24-hour changed the hour axis but left every chip reading "2:30PM".
    signInWith({ timeFormat: '24h' });
    expect(formatUserTimeCompact('14:30')).toBe('14:30');
    expect(formatUserTimeCompact('14:00')).toBe('14:00');
    expect(formatUserTimeCompact('09:05')).toBe('09:05');
    expect(formatUserTimeCompact('00:00')).toBe('00:00');
  });

  it('drops the minutes on the hour in 12-hour mode to save width', () => {
    signInWith({ timeFormat: '12h' });
    expect(formatUserTimeCompact('14:00')).toBe('2PM');
    expect(formatUserTimeCompact('14:30')).toBe('2:30PM');
    expect(formatUserTimeCompact('00:00')).toBe('12AM');
    expect(formatUserTimeCompact('12:00')).toBe('12PM');
    expect(formatUserTimeCompact('00:15')).toBe('12:15AM');
  });

  it('returns an empty string for a missing time', () => {
    expect(formatUserTimeCompact(null)).toBe('');
    expect(formatUserTimeCompact(undefined)).toBe('');
  });

  it('passes an unparseable value through rather than rendering NaN', () => {
    signInWith({ timeFormat: '12h' });
    expect(formatUserTimeCompact('garbage')).toBe('garbage');
  });
});

describe('formatUserDateTime', () => {
  it('combines both preferences', () => {
    signInWith({ dateFormat: 'dd/MM/yyyy', timeFormat: '24h' });
    expect(formatUserDateTime(DATE)).toBe('05/01/2026 at 14:30');

    signInWith({ dateFormat: 'MMM d, yyyy', timeFormat: '12h' });
    expect(formatUserDateTime(DATE)).toBe('Jan 5, 2026 at 2:30 PM');
  });
});

describe('formatUserHour', () => {
  it('renders a zero-padded 24-hour label', () => {
    signInWith({ timeFormat: '24h' });
    expect(formatUserHour(0)).toBe('00:00');
    expect(formatUserHour(9)).toBe('09:00');
    expect(formatUserHour(23)).toBe('23:00');
  });

  it('renders a 12-hour label with meridiem', () => {
    signInWith({ timeFormat: '12h' });
    expect(formatUserHour(0)).toBe('12 AM');
    expect(formatUserHour(11)).toBe('11 AM');
    expect(formatUserHour(12)).toBe('12 PM');
    expect(formatUserHour(13)).toBe('1 PM');
  });
});

describe('userWeekStartsOn', () => {
  it('defaults to Sunday and reflects the saved preference', () => {
    expect(userWeekStartsOn()).toBe(0);
    signInWith({ weekStart: 1 });
    expect(userWeekStartsOn()).toBe(1);
    signInWith({ weekStart: 6 });
    expect(userWeekStartsOn()).toBe(6);
  });
});
