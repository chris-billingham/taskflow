export function parseRecurrenceText(text: string): string {
  const lower = text.toLowerCase().trim();

  const dayMap: Record<string, string> = {
    monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH',
    friday: 'FR', saturday: 'SA', sunday: 'SU',
  };

  // "every day", "every 2 days"
  const dailyMatch = lower.match(/^every\s+(?:(\d+)\s+)?days?$/);
  if (dailyMatch) {
    const interval = parseInt(dailyMatch[1] || '1', 10);
    return `FREQ=DAILY;INTERVAL=${interval}`;
  }

  // "every week", "every 2 weeks"
  const weeklyMatch = lower.match(/^every\s+(?:(\d+)\s+)?weeks?$/);
  if (weeklyMatch) {
    const interval = parseInt(weeklyMatch[1] || '1', 10);
    return `FREQ=WEEKLY;INTERVAL=${interval}`;
  }

  // "every month", "every 3 months"
  const monthlyMatch = lower.match(/^every\s+(?:(\d+)\s+)?months?$/);
  if (monthlyMatch) {
    const interval = parseInt(monthlyMatch[1] || '1', 10);
    return `FREQ=MONTHLY;INTERVAL=${interval}`;
  }

  // "every year", "every 2 years"
  const yearlyMatch = lower.match(/^every\s+(?:(\d+)\s+)?years?$/);
  if (yearlyMatch) {
    const interval = parseInt(yearlyMatch[1] || '1', 10);
    return `FREQ=YEARLY;INTERVAL=${interval}`;
  }

  // "every Monday", "every Tuesday", etc.
  for (const [dayName, dayCode] of Object.entries(dayMap)) {
    if (lower === `every ${dayName}`) {
      return `FREQ=WEEKLY;INTERVAL=1;BYDAY=${dayCode}`;
    }
  }

  // "every weekday"
  if (lower === 'every weekday') {
    return 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR';
  }

  // Default: daily
  return 'FREQ=DAILY;INTERVAL=1';
}

function parseRule(rrule: string): Map<string, string> {
  const parts = new Map<string, string>();
  for (const part of rrule.split(';')) {
    const [key, value] = part.split('=');
    if (key && value !== undefined) parts.set(key.toUpperCase(), value);
  }
  return parts;
}

/** Parse UNTIL=YYYYMMDD / YYYYMMDDTHHMMSSZ / ISO date into a Date, or null. */
function parseUntil(value: string | undefined): Date | null {
  if (!value) return null;
  const basic = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
  if (basic) {
    const [, y, m, d, hh, mm, ss] = basic;
    return new Date(
      Date.UTC(+y, +m - 1, +d, +(hh ?? 23), +(mm ?? 59), +(ss ?? 59)),
    );
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The next occurrence after fromDate, or null when the series has ended
 * (UNTIL passed, or COUNT exhausted — COUNT means total occurrences and is
 * decremented via advanceRecurrenceRule() each time an occurrence is spawned).
 */
export function getNextOccurrence(rrule: string, fromDate: Date): Date | null {
  const parts = parseRule(rrule);

  const count = parts.has('COUNT') ? parseInt(parts.get('COUNT')!, 10) : null;
  // COUNT=N means N occurrences in total; the one being completed was the
  // last when N <= 1.
  if (count !== null && count <= 1) return null;

  const freq = parts.get('FREQ') || 'DAILY';
  const interval = parseInt(parts.get('INTERVAL') || '1', 10);
  const byDay = parts.get('BYDAY')?.split(',');

  const next = new Date(fromDate);

  // All arithmetic below is UTC. fromDate is a calendar date encoded as UTC
  // midnight (utils/dates.ts), so local getters/setters read it as the PREVIOUS
  // day in any behind-UTC zone: BYDAY resolved against the wrong weekday
  // (a weekday-only rule could land on a Saturday), INTERVAL collapsed, the
  // month-end clamp below was defeated, and DST steps of 23/25h knocked the
  // result off midnight entirely. Latent while hosts run UTC — the containers
  // set no TZ — and wrong everywhere else.
  switch (freq) {
    case 'DAILY':
      next.setUTCDate(next.getUTCDate() + interval);
      break;

    case 'WEEKLY':
      if (byDay && byDay.length > 0) {
        const dayCodeToNum: Record<string, number> = {
          SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
        };
        const targetDays = byDay.map((d) => dayCodeToNum[d]).filter((d) => d !== undefined);

        if (targetDays.length > 0) {
          const currentDay = next.getUTCDay();
          // Find next matching day
          let daysToAdd = Infinity;
          for (const target of targetDays) {
            let diff = target - currentDay;
            if (diff <= 0) diff += 7;
            if (diff < daysToAdd) daysToAdd = diff;
          }
          // INTERVAL applies to WEEKS: "every 2 weeks on Monday" advances to
          // the next Monday and then skips interval-1 further weeks whenever
          // the step crosses into a new week. (Previously INTERVAL was
          // ignored here — every-other-Monday fired every Monday.)
          const crossesWeekBoundary = currentDay + daysToAdd >= 7;
          next.setUTCDate(
            next.getUTCDate() +
              daysToAdd +
              (crossesWeekBoundary ? (interval - 1) * 7 : 0),
          );
        } else {
          next.setUTCDate(next.getUTCDate() + 7 * interval);
        }
      } else {
        next.setUTCDate(next.getUTCDate() + 7 * interval);
      }
      break;

    case 'MONTHLY': {
      // Clamp to the last valid day so e.g. Jan 31 + 1 month → Feb 28/29 rather
      // than JS's silent overflow to Mar 2/3 (which then drifts forever).
      const day = next.getUTCDate();
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + interval);
      const daysInMonth = new Date(
        Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
      ).getUTCDate();
      next.setUTCDate(Math.min(day, daysInMonth));
      break;
    }

    case 'YEARLY': {
      // Clamp Feb 29 → Feb 28 in non-leap target years (otherwise overflows to Mar 1).
      const day = next.getUTCDate();
      next.setUTCDate(1);
      next.setUTCFullYear(next.getUTCFullYear() + interval);
      const daysInMonth = new Date(
        Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
      ).getUTCDate();
      next.setUTCDate(Math.min(day, daysInMonth));
      break;
    }
  }

  const until = parseUntil(parts.get('UNTIL'));
  if (until && next > until) return null;

  return next;
}

/**
 * The rule string the NEXT occurrence should carry: COUNT decrements by one
 * per spawned occurrence (it has no other way to be tracked), everything else
 * passes through unchanged.
 */
export function advanceRecurrenceRule(rrule: string): string {
  const parts = parseRule(rrule);
  if (!parts.has('COUNT')) return rrule;
  const count = parseInt(parts.get('COUNT')!, 10);
  return rrule.replace(/COUNT=\d+/i, `COUNT=${Math.max(count - 1, 0)}`);
}
