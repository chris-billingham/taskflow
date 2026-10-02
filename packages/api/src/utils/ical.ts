/**
 * A minimal iCalendar (RFC 5545) writer: enough for a read-only feed of
 * events that calendar apps subscribe to.
 */

/** Text values escape backslash, semicolon, comma and newlines. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets continue on the next line after a space. */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never split a multi-byte character: back up to a character boundary.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74; // continuation lines start with a space
  }
  return parts.join('\r\n ');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 20261005 */
export function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

/** 20261005T083000Z */
export function formatDateTime(date: Date): string {
  return `${formatDate(date)}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

export interface CalendarEvent {
  uid: string;
  stamp: Date;
  summary: string;
  description?: string;
  url?: string;
  /** All day (a date) or a span of time (instants). */
  start: { date: Date } | { at: Date };
  end: { date: Date } | { at: Date };
  /** 1 (highest) to 9; omitted when there's no priority. */
  priority?: number;
}

function dateProperty(name: string, value: { date: Date } | { at: Date }): string {
  return 'date' in value ? `${name};VALUE=DATE:${formatDate(value.date)}` : `${name}:${formatDateTime(value.at)}`;
}

export function renderCalendar(name: string, events: CalendarEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Taskflow//Taskflow//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    // Ask subscribers to check back hourly (not all honour it).
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${formatDateTime(event.stamp)}`,
      dateProperty('DTSTART', event.start),
      dateProperty('DTEND', event.end),
      `SUMMARY:${escapeText(event.summary)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    if (event.priority) lines.push(`PRIORITY:${event.priority}`);
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
