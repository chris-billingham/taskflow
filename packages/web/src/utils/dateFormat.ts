import { format } from 'date-fns';
import { useAuthStore } from '@/stores/authStore';

// Renders dates and times according to the user's saved preferences
// (Settings → Preferences). Before this existed, the preferences saved and
// persisted fine but every display site hardcoded its own format string, so
// changing them did nothing visible.

const DEFAULT_DATE_FORMAT = 'MMM d, yyyy';

// The formats offered in Settings → Preferences. `User.dateFormat` is a free
// text column (the API only bounds its length), so an unrecognised value falls
// back to the default instead of reaching date-fns, which throws on unknown
// tokens and would take down every view that renders a date.
const SUPPORTED_DATE_FORMATS = new Set([
  'MMM d, yyyy',
  'MM/dd/yyyy',
  'dd/MM/yyyy',
  'yyyy-MM-dd',
]);

function prefs() {
  const user = useAuthStore.getState().user;
  const stored = user?.dateFormat;
  return {
    dateFormat:
      stored && SUPPORTED_DATE_FORMATS.has(stored) ? stored : DEFAULT_DATE_FORMAT,
    timeFormat: user?.timeFormat === '24h' ? '24h' : '12h',
    weekStart: (user?.weekStart ?? 0) as 0 | 1 | 6,
  };
}

/**
 * A date in exactly the format chosen in Settings → Preferences, year included.
 *
 * There is deliberately no "compact" variant. The previous one hand-mapped each
 * preference to a shorter string, dropped the year from all four, and rendered
 * `dd/MM/yyyy` as "5 Jan" — so choosing a numeric day-first format produced a
 * month-name format instead, and `MM/dd/yyyy` produced a bare "01/05" that was
 * indistinguishable from day-first. One function, one behaviour: what the user
 * picked is what they see.
 */
export function formatUserDate(date: Date): string {
  return format(date, prefs().dateFormat);
}

/** Render an "HH:mm" time string per the user's 12h/24h preference. */
export function formatUserTime(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  if (prefs().timeFormat === '24h') return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * Space-constrained time for calendar chips: "14:30" in 24-hour mode, and
 * "2:30PM" — or just "2PM" on the hour — in 12-hour mode. The unpadded hour and
 * missing space are deliberate; these render inside narrow, often 20px-tall
 * blocks. The calendar used to hardcode the 12-hour form, so choosing 24-hour
 * changed the hour axis but left every task chip in 12-hour.
 */
export function formatUserTimeCompact(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;

  if (prefs().timeFormat === '24h') {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0
    ? `${hour12}${suffix}`
    : `${hour12}:${String(m).padStart(2, '0')}${suffix}`;
}

/** A date and a clock time together, both in the user's chosen formats. */
export function formatUserDateTime(date: Date): string {
  return `${formatUserDate(date)} at ${formatUserTime(format(date, 'HH:mm'))}`;
}

/** Weekday name prefixed to a full date, e.g. "Monday, 05/01/2026". */
export function formatUserDateWithWeekday(
  date: Date,
  style: 'EEE' | 'EEEE' = 'EEEE',
): string {
  return `${format(date, style)}, ${formatUserDate(date)}`;
}

/** Hour-axis label (calendar views) per the 12h/24h preference. */
export function formatUserHour(hour: number): string {
  if (prefs().timeFormat === '24h') return `${String(hour).padStart(2, '0')}:00`;
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

/** The user's "week starts on" day for calendar grids (0=Sun, 1=Mon, 6=Sat). */
export function userWeekStartsOn(): 0 | 1 | 6 {
  return prefs().weekStart;
}
