/**
 * The recurrence rule format: an RRULE subset (FREQ, INTERVAL, BYDAY, COUNT,
 * UNTIL). The API advances series with it and the web picker builds and reads
 * it, so both use this one parser. A rule this file accepts is a rule the
 * server can advance.
 */

export const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export interface ParsedRecurrence {
  freq: Frequency;
  interval: number;
  byDay: WeekdayCode[];
  /** Occurrences left, counting the current one. */
  count: number | null;
  /** Raw UNTIL value (YYYYMMDD, YYYYMMDDTHHMMSSZ or an ISO date). */
  until: string | null;
}

function parseParts(rule: string): Map<string, string> {
  const parts = new Map<string, string>();
  for (const chunk of rule.split(';')) {
    const [key, value] = chunk.split('=');
    if (key && value !== undefined) parts.set(key.trim().toUpperCase(), value.trim());
  }
  return parts;
}

/** Parse a rule leniently: unknown values fall back to safe defaults. */
export function parseRecurrence(rule: string | null | undefined): ParsedRecurrence | null {
  if (!rule?.trim()) return null;

  const parts = parseParts(rule);
  const rawFreq = parts.get('FREQ');
  const freq: Frequency = (FREQUENCIES as readonly string[]).includes(rawFreq ?? '')
    ? (rawFreq as Frequency)
    : 'DAILY';

  const interval = Math.max(1, parseInt(parts.get('INTERVAL') ?? '1', 10) || 1);

  const byDay = (parts.get('BYDAY')?.split(',') ?? [])
    .map((d) => d.trim().toUpperCase())
    .filter((d): d is WeekdayCode => (WEEKDAY_CODES as readonly string[]).includes(d));

  const rawCount = parts.get('COUNT');
  const count = rawCount ? parseInt(rawCount, 10) : null;

  return {
    freq,
    interval,
    byDay,
    count: count !== null && Number.isFinite(count) ? count : null,
    until: parts.get('UNTIL') ?? null,
  };
}

export function buildRecurrence(options: {
  freq: Frequency;
  interval?: number;
  byDay?: WeekdayCode[];
}): string {
  // Within isSupportedRecurrence's INTERVAL range, so a built rule always validates.
  const interval = Math.min(999, Math.max(1, Math.trunc(options.interval ?? 1) || 1));
  const segments = [`FREQ=${options.freq}`, `INTERVAL=${interval}`];

  // BYDAY only means anything to a weekly rule in the server's implementation.
  if (options.freq === 'WEEKLY' && options.byDay?.length) {
    const ordered = WEEKDAY_CODES.filter((code) => options.byDay!.includes(code));
    segments.push(`BYDAY=${ordered.join(',')}`);
  }

  return segments.join(';');
}

const UNTIL_PATTERN = /^\d{8}(T\d{6}Z?)?$|^\d{4}-\d{2}-\d{2}/;

/**
 * Strict check for rules clients send: every part known and well-formed. The
 * lenient parser above would silently repair a malformed rule into a daily
 * repeat, so writes are validated with this instead.
 */
export function isSupportedRecurrence(rule: string): boolean {
  const chunks = rule.split(';').filter((c) => c.trim() !== '');
  if (chunks.length === 0) return false;

  const seen = new Set<string>();
  for (const chunk of chunks) {
    const [rawKey, value, extra] = chunk.split('=');
    if (!rawKey || value === undefined || extra !== undefined) return false;
    const key = rawKey.trim().toUpperCase();
    const v = value.trim().toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);

    switch (key) {
      case 'FREQ':
        if (!(FREQUENCIES as readonly string[]).includes(v)) return false;
        break;
      case 'INTERVAL':
        if (!/^\d{1,3}$/.test(v) || Number(v) < 1) return false;
        break;
      case 'BYDAY':
        if (!v.split(',').every((d) => (WEEKDAY_CODES as readonly string[]).includes(d))) return false;
        break;
      case 'COUNT':
        // 0 is valid: advancing the last occurrence of a COUNT series leaves it at 0.
        if (!/^\d{1,4}$/.test(v)) return false;
        break;
      case 'UNTIL':
        if (!UNTIL_PATTERN.test(v)) return false;
        break;
      default:
        return false;
    }
  }
  return seen.has('FREQ');
}
