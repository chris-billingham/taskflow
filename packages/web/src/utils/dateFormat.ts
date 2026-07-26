import { format } from 'date-fns';
import { useAuthStore } from '@/stores/authStore';

// Renders dates and times according to the user's saved preferences
// (Settings → Preferences). Before this existed, the preferences saved and
// persisted fine but every display site hardcoded its own format string, so
// changing them did nothing visible.

const DEFAULT_DATE_FORMAT = 'MMM d, yyyy';

function prefs() {
  const user = useAuthStore.getState().user;
  return {
    dateFormat: user?.dateFormat || DEFAULT_DATE_FORMAT,
    timeFormat: user?.timeFormat || '12h',
    weekStart: (user?.weekStart ?? 0) as 0 | 1 | 6,
  };
}

/** Full date (with year) in the user's chosen format. */
export function formatUserDate(date: Date): string {
  return format(date, prefs().dateFormat);
}

/**
 * Compact date (no year) for badges and group headers, keeping the day/month
 * ordering of the user's chosen format.
 */
export function formatUserShortDate(date: Date): string {
  switch (prefs().dateFormat) {
    case 'dd/MM/yyyy':
      return format(date, 'd MMM');
    case 'MM/dd/yyyy':
      return format(date, 'MM/dd');
    case 'yyyy-MM-dd':
      return format(date, 'MM-dd');
    default:
      return format(date, 'MMM d');
  }
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
