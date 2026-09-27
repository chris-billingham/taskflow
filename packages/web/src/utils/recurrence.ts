/**
 * Recurrence rules for display and editing.
 *
 * The API stores an RRULE-ish subset (FREQ/INTERVAL/BYDAY, with COUNT and
 * UNTIL honoured when spawning occurrences) and has always been able to create
 * and advance a series. What was missing was any way to see or change one: the
 * only entry point was typing "every Monday" into quick-add, and nothing in the
 * UI showed that a task repeated at all. These helpers keep the picker's
 * vocabulary aligned with what the server actually understands — a rule this
 * file can build is a rule getNextOccurrence() can advance.
 */

import {
  WEEKDAY_CODES,
  buildRecurrence,
  parseRecurrence,
  type Frequency,
  type ParsedRecurrence,
  type WeekdayCode,
} from '@taskflow/contract';

// The rule format itself (parse/build) lives in the contract, shared with the
// API; this file keeps the display side: names, summaries, presets.
export { WEEKDAY_CODES, buildRecurrence, parseRecurrence };
export type { Frequency, ParsedRecurrence, WeekdayCode };

const WEEKDAY_NAMES: Record<WeekdayCode, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};

function listWeekdays(days: WeekdayCode[]): string {
  const names = WEEKDAY_CODES.filter((c) => days.includes(c)).map((c) => WEEKDAY_NAMES[c]);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const UNIT: Record<Frequency, [singular: string, plural: string]> = {
  DAILY: ['day', 'days'],
  WEEKLY: ['week', 'weeks'],
  MONTHLY: ['month', 'months'],
  YEARLY: ['year', 'years'],
};

/** Human-readable summary of a rule, e.g. "Every 2 weeks on Monday". */
export function describeRecurrence(rule: string | null | undefined): string | null {
  const parsed = parseRecurrence(rule);
  if (!parsed) return null;

  const { freq, interval, byDay } = parsed;
  const [singular, plural] = UNIT[freq];

  let text: string;
  if (freq === 'WEEKLY' && byDay.length > 0) {
    const isWeekdays =
      byDay.length === 5 && ['MO', 'TU', 'WE', 'TH', 'FR'].every((d) => byDay.includes(d as WeekdayCode));
    if (isWeekdays && interval === 1) {
      text = 'Every weekday';
    } else {
      text =
        interval === 1
          ? `Every ${listWeekdays(byDay)}`
          : `Every ${interval} weeks on ${listWeekdays(byDay)}`;
    }
  } else {
    text = interval === 1 ? `Every ${singular}` : `Every ${interval} ${plural}`;
  }

  // Surfacing the tail matters: a series with COUNT quietly stops, and without
  // this the picker would claim the task repeats forever.
  if (parsed.count !== null) {
    text += `, ${parsed.count} more time${parsed.count === 1 ? '' : 's'}`;
  } else if (parsed.until) {
    const iso = parsed.until.match(/^(\d{4})(\d{2})(\d{2})/);
    if (iso) text += `, until ${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  return text;
}

/** Short form for inline badges, e.g. "2w" or "Mon". */
export function shortRecurrenceLabel(rule: string | null | undefined): string | null {
  const parsed = parseRecurrence(rule);
  if (!parsed) return null;

  if (parsed.freq === 'WEEKLY' && parsed.byDay.length === 1) {
    return WEEKDAY_NAMES[parsed.byDay[0]].slice(0, 3);
  }

  const letter = { DAILY: 'd', WEEKLY: 'w', MONTHLY: 'mo', YEARLY: 'y' }[parsed.freq];
  return parsed.interval === 1 ? `1${letter}` : `${parsed.interval}${letter}`;
}

export interface RecurrencePreset {
  label: string;
  rule: string;
}

export const RECURRENCE_PRESETS: RecurrencePreset[] = [
  { label: 'Daily', rule: buildRecurrence({ freq: 'DAILY' }) },
  {
    label: 'Every weekday',
    rule: buildRecurrence({
      freq: 'WEEKLY',
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
    }),
  },
  { label: 'Weekly', rule: buildRecurrence({ freq: 'WEEKLY' }) },
  { label: 'Every 2 weeks', rule: buildRecurrence({ freq: 'WEEKLY', interval: 2 }) },
  { label: 'Monthly', rule: buildRecurrence({ freq: 'MONTHLY' }) },
  { label: 'Yearly', rule: buildRecurrence({ freq: 'YEARLY' }) },
];
