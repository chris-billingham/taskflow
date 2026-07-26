import { prisma } from '../config/database.js';

// ─────────────────────────────────────────────────────────────────────────────
// One timezone convention for the whole backend:
//
// - Task due dates are CALENDAR dates, stored as UTC midnight of that date
//   (new Date('YYYY-MM-DD')). They mean "the 26th" wherever you are.
// - "Today" is therefore the user's calendar date IN THEIR IANA TIMEZONE,
//   re-encoded as UTC midnight for comparisons against stored due dates.
//
// Before this, three different bases were mixed (server-local midnight, UTC
// truncation, and JS UTC-midnight parsing), so users east of UTC saw evening
// tasks flip to "overdue" and quick-add landed on the wrong day.
// ─────────────────────────────────────────────────────────────────────────────

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The user's stored IANA timezone, with a safe fallback. */
export async function getUserTimezone(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = user?.timezone ?? 'UTC';
  return isValidTimeZone(tz) ? tz : 'UTC';
}

function tzParts(tz: string, base: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(base);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * The user's current calendar day, encoded as the UTC-midnight instants used
 * by stored due dates. `todayStart <= dueDate < tomorrowStart` ⇔ "due today".
 */
export function userDayBoundariesUTC(tz: string, base: Date = new Date()) {
  const { year, month, day } = tzParts(tz, base);
  const todayStart = new Date(Date.UTC(year, month - 1, day));
  const tomorrowStart = new Date(Date.UTC(year, month - 1, day + 1));
  return { todayStart, tomorrowStart };
}

/**
 * A Date whose LOCAL components mirror the wall clock in `tz` right now.
 * Lets calendar arithmetic written with local getters/setters (the natural-
 * language parsers) operate in the user's timezone regardless of server TZ.
 */
export function nowAsTzWallClock(tz: string, base: Date = new Date()): Date {
  const { year, month, day, hour, minute, second } = tzParts(tz, base);
  return new Date(year, month - 1, day, hour, minute, second);
}
