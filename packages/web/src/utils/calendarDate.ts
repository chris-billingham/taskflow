/**
 * Due dates and deadlines are calendar days, sent as YYYY-MM-DD. Read them as
 * midnight of that day in the user's own timezone: `new Date('2026-09-27')`
 * means UTC midnight, which is still the 26th anywhere west of London.
 */
export function parseCalendarDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
