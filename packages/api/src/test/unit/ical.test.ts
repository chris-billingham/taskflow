import { describe, it, expect } from 'vitest';
import { escapeText, foldLine, renderCalendar } from '../../utils/ical.js';

describe('iCalendar writer', () => {
  it('escapes text values', () => {
    expect(escapeText('Buy milk, eggs; bread\\rolls\nthen home')).toBe('Buy milk\\, eggs\\; bread\\\\rolls\\nthen home');
  });

  it('folds long lines at 75 octets without splitting characters', () => {
    const line = `SUMMARY:${'é'.repeat(60)}`;
    const folded = foldLine(line);
    for (const part of folded.split('\r\n')) expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n ').join('')).toBe(line);
  });

  it('writes all-day and timed events with CRLF line endings', () => {
    const ics = renderCalendar('Work', [
      {
        uid: 't1@taskflow',
        stamp: new Date('2026-10-02T10:00:00Z'),
        summary: 'Book the venue',
        start: { date: new Date('2026-10-05T00:00:00Z') },
        end: { date: new Date('2026-10-06T00:00:00Z') },
        priority: 1,
      },
      {
        uid: 't2@taskflow',
        stamp: new Date('2026-10-02T10:00:00Z'),
        summary: 'Call',
        start: { at: new Date('2026-10-05T08:30:00Z') },
        end: { at: new Date('2026-10-05T09:00:00Z') },
      },
    ]);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261005\r\nDTEND;VALUE=DATE:20261006\r\n');
    expect(ics).toContain('DTSTART:20261005T083000Z\r\nDTEND:20261005T090000Z\r\n');
    expect(ics).toContain('PRIORITY:1\r\n');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
