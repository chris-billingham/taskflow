import { describe, it, expect } from 'vitest';
import { parseRecurrenceText, getNextOccurrence } from '../../utils/recurrence.js';

describe('parseRecurrenceText', () => {
  it.each([
    ['every day', 'FREQ=DAILY;INTERVAL=1'],
    ['every 2 days', 'FREQ=DAILY;INTERVAL=2'],
    ['every week', 'FREQ=WEEKLY;INTERVAL=1'],
    ['every 2 weeks', 'FREQ=WEEKLY;INTERVAL=2'],
    ['every month', 'FREQ=MONTHLY;INTERVAL=1'],
    ['every 3 months', 'FREQ=MONTHLY;INTERVAL=3'],
    ['every year', 'FREQ=YEARLY;INTERVAL=1'],
    ['every 2 years', 'FREQ=YEARLY;INTERVAL=2'],
    ['every Monday', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO'],
    ['every Tuesday', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU'],
    ['every Wednesday', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=WE'],
    ['every Thursday', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TH'],
    ['every Friday', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=FR'],
    ['every Saturday', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=SA'],
    ['every Sunday', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=SU'],
    ['every weekday', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR'],
  ] as [string, string][])('parses "%s"', (input, expected) => {
    expect(parseRecurrenceText(input)).toBe(expected);
  });

  it('is case-insensitive for period keywords', () => {
    expect(parseRecurrenceText('Every Day')).toBe('FREQ=DAILY;INTERVAL=1');
    expect(parseRecurrenceText('EVERY WEEK')).toBe('FREQ=WEEKLY;INTERVAL=1');
  });

  it('is case-insensitive for day names', () => {
    expect(parseRecurrenceText('every MONDAY')).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO');
  });

  it('returns default daily for unrecognized patterns', () => {
    expect(parseRecurrenceText('some random text')).toBe('FREQ=DAILY;INTERVAL=1');
    expect(parseRecurrenceText('')).toBe('FREQ=DAILY;INTERVAL=1');
  });

  it('handles plural and singular forms', () => {
    expect(parseRecurrenceText('every 1 day')).toBe('FREQ=DAILY;INTERVAL=1');
    expect(parseRecurrenceText('every 1 week')).toBe('FREQ=WEEKLY;INTERVAL=1');
  });
});

describe('getNextOccurrence', () => {
  // 2024-01-01T12:00:00Z is a Monday
  const monday = new Date('2024-01-01T12:00:00.000Z');

  it('adds 1 day for DAILY;INTERVAL=1', () => {
    const next = getNextOccurrence('FREQ=DAILY;INTERVAL=1', monday);
    const diff = next.getTime() - monday.getTime();
    expect(diff).toBe(24 * 60 * 60 * 1000);
  });

  it('adds 2 days for DAILY;INTERVAL=2', () => {
    const next = getNextOccurrence('FREQ=DAILY;INTERVAL=2', monday);
    const diff = next.getTime() - monday.getTime();
    expect(diff).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('adds 7 days for WEEKLY;INTERVAL=1 without BYDAY', () => {
    const next = getNextOccurrence('FREQ=WEEKLY;INTERVAL=1', monday);
    const diff = next.getTime() - monday.getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('adds 14 days for WEEKLY;INTERVAL=2 without BYDAY', () => {
    const next = getNextOccurrence('FREQ=WEEKLY;INTERVAL=2', monday);
    const diff = next.getTime() - monday.getTime();
    expect(diff).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('advances to next Tuesday from Monday with BYDAY=TU', () => {
    const next = getNextOccurrence('FREQ=WEEKLY;INTERVAL=1;BYDAY=TU', monday);
    const diff = next.getTime() - monday.getTime();
    expect(diff).toBe(1 * 24 * 60 * 60 * 1000); // +1 day
  });

  it('advances to next Friday from Monday with BYDAY=FR', () => {
    const next = getNextOccurrence('FREQ=WEEKLY;INTERVAL=1;BYDAY=FR', monday);
    const diff = next.getTime() - monday.getTime();
    expect(diff).toBe(4 * 24 * 60 * 60 * 1000); // +4 days (Mon -> Fri)
  });

  it('wraps around to next Monday from Monday with BYDAY=MO (adds 7 days)', () => {
    const next = getNextOccurrence('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO', monday);
    const diff = next.getTime() - monday.getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000); // next Monday
  });

  it('finds nearest day with multiple BYDAY targets', () => {
    // From Monday, BYDAY=MO,TU,WE,TH,FR: nearest is Tuesday (+1)
    const next = getNextOccurrence('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR', monday);
    const diff = next.getTime() - monday.getTime();
    expect(diff).toBe(1 * 24 * 60 * 60 * 1000);
  });

  it('adds 1 month for MONTHLY;INTERVAL=1', () => {
    const next = getNextOccurrence('FREQ=MONTHLY;INTERVAL=1', monday);
    expect(next.getMonth()).toBe(monday.getMonth() + 1);
    expect(next.getDate()).toBe(monday.getDate());
  });

  it('adds 3 months for MONTHLY;INTERVAL=3', () => {
    const next = getNextOccurrence('FREQ=MONTHLY;INTERVAL=3', monday);
    expect(next.getMonth()).toBe(monday.getMonth() + 3);
  });

  it('adds 1 year for YEARLY;INTERVAL=1', () => {
    const next = getNextOccurrence('FREQ=YEARLY;INTERVAL=1', monday);
    expect(next.getFullYear()).toBe(2025);
    expect(next.getMonth()).toBe(monday.getMonth());
    expect(next.getDate()).toBe(monday.getDate());
  });

  it('preserves the time component', () => {
    const next = getNextOccurrence('FREQ=DAILY;INTERVAL=1', monday);
    expect(next.getHours()).toBe(monday.getHours());
    expect(next.getMinutes()).toBe(monday.getMinutes());
    expect(next.getSeconds()).toBe(monday.getSeconds());
  });
});
