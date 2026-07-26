import { describe, it, expect } from 'vitest';
import {
  RECURRENCE_PRESETS,
  buildRecurrence,
  describeRecurrence,
  parseRecurrence,
  shortRecurrenceLabel,
} from '@/utils/recurrence';

describe('parseRecurrence', () => {
  it('returns null for absent or blank rules', () => {
    expect(parseRecurrence(null)).toBeNull();
    expect(parseRecurrence(undefined)).toBeNull();
    expect(parseRecurrence('   ')).toBeNull();
  });

  it('parses frequency and interval', () => {
    expect(parseRecurrence('FREQ=WEEKLY;INTERVAL=2')).toMatchObject({
      freq: 'WEEKLY',
      interval: 2,
    });
  });

  it('parses BYDAY into weekday codes', () => {
    expect(parseRecurrence('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,FR')?.byDay).toEqual(['MO', 'FR']);
  });

  it('drops unrecognised BYDAY values', () => {
    expect(parseRecurrence('FREQ=WEEKLY;BYDAY=MO,XX')?.byDay).toEqual(['MO']);
  });

  it('defaults a missing interval to 1 and a missing freq to DAILY', () => {
    expect(parseRecurrence('FREQ=DAILY')).toMatchObject({ freq: 'DAILY', interval: 1 });
    expect(parseRecurrence('INTERVAL=3')).toMatchObject({ freq: 'DAILY', interval: 3 });
  });

  it('clamps a nonsense interval to at least 1', () => {
    expect(parseRecurrence('FREQ=DAILY;INTERVAL=0')?.interval).toBe(1);
    expect(parseRecurrence('FREQ=DAILY;INTERVAL=abc')?.interval).toBe(1);
  });

  it('is case-insensitive on keys', () => {
    expect(parseRecurrence('freq=MONTHLY;interval=2')).toMatchObject({
      freq: 'MONTHLY',
      interval: 2,
    });
  });

  it('carries COUNT and UNTIL through', () => {
    expect(parseRecurrence('FREQ=DAILY;COUNT=5')?.count).toBe(5);
    expect(parseRecurrence('FREQ=DAILY;UNTIL=20261231')?.until).toBe('20261231');
  });
});

describe('buildRecurrence', () => {
  it('emits freq and interval', () => {
    expect(buildRecurrence({ freq: 'DAILY' })).toBe('FREQ=DAILY;INTERVAL=1');
    expect(buildRecurrence({ freq: 'MONTHLY', interval: 3 })).toBe('FREQ=MONTHLY;INTERVAL=3');
  });

  it('includes BYDAY for weekly rules, in week order', () => {
    expect(buildRecurrence({ freq: 'WEEKLY', byDay: ['FR', 'MO'] })).toBe(
      'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,FR',
    );
  });

  it('omits BYDAY for non-weekly rules, which ignore it server-side', () => {
    expect(buildRecurrence({ freq: 'MONTHLY', byDay: ['MO'] })).toBe(
      'FREQ=MONTHLY;INTERVAL=1',
    );
  });

  it('clamps interval to at least 1', () => {
    expect(buildRecurrence({ freq: 'DAILY', interval: 0 })).toBe('FREQ=DAILY;INTERVAL=1');
  });

  it('round-trips through parseRecurrence', () => {
    const rule = buildRecurrence({ freq: 'WEEKLY', interval: 2, byDay: ['TU', 'TH'] });
    expect(parseRecurrence(rule)).toMatchObject({
      freq: 'WEEKLY',
      interval: 2,
      byDay: ['TU', 'TH'],
    });
  });
});

describe('describeRecurrence', () => {
  it('returns null when there is no rule', () => {
    expect(describeRecurrence(null)).toBeNull();
  });

  it.each([
    ['FREQ=DAILY;INTERVAL=1', 'Every day'],
    ['FREQ=DAILY;INTERVAL=3', 'Every 3 days'],
    ['FREQ=WEEKLY;INTERVAL=1', 'Every week'],
    ['FREQ=WEEKLY;INTERVAL=2', 'Every 2 weeks'],
    ['FREQ=MONTHLY;INTERVAL=1', 'Every month'],
    ['FREQ=YEARLY;INTERVAL=2', 'Every 2 years'],
  ])('%s reads as "%s"', (rule, expected) => {
    expect(describeRecurrence(rule)).toBe(expected);
  });

  it('names a single weekday', () => {
    expect(describeRecurrence('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO')).toBe('Every Monday');
  });

  it('joins two weekdays with "and"', () => {
    expect(describeRecurrence('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE')).toBe(
      'Every Monday and Wednesday',
    );
  });

  it('comma-separates three or more weekdays', () => {
    expect(describeRecurrence('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR')).toBe(
      'Every Monday, Wednesday and Friday',
    );
  });

  it('recognises the weekday set as "Every weekday"', () => {
    expect(describeRecurrence('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR')).toBe(
      'Every weekday',
    );
  });

  it('keeps the interval when weekdays repeat less often than weekly', () => {
    expect(describeRecurrence('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO')).toBe(
      'Every 2 weeks on Monday',
    );
  });

  it('surfaces a COUNT tail so a finite series does not look endless', () => {
    expect(describeRecurrence('FREQ=DAILY;INTERVAL=1;COUNT=3')).toBe(
      'Every day, 3 more times',
    );
    expect(describeRecurrence('FREQ=DAILY;INTERVAL=1;COUNT=1')).toBe(
      'Every day, 1 more time',
    );
  });

  it('surfaces an UNTIL tail', () => {
    expect(describeRecurrence('FREQ=WEEKLY;INTERVAL=1;UNTIL=20261231')).toBe(
      'Every week, until 2026-12-31',
    );
  });

  it('describes every shipped preset', () => {
    for (const preset of RECURRENCE_PRESETS) {
      expect(describeRecurrence(preset.rule)).toBeTruthy();
    }
  });
});

describe('shortRecurrenceLabel', () => {
  it.each([
    ['FREQ=DAILY;INTERVAL=1', '1d'],
    ['FREQ=DAILY;INTERVAL=3', '3d'],
    ['FREQ=WEEKLY;INTERVAL=2', '2w'],
    ['FREQ=MONTHLY;INTERVAL=1', '1mo'],
    ['FREQ=YEARLY;INTERVAL=1', '1y'],
  ])('%s shortens to %s', (rule, expected) => {
    expect(shortRecurrenceLabel(rule)).toBe(expected);
  });

  it('abbreviates a single named weekday', () => {
    expect(shortRecurrenceLabel('FREQ=WEEKLY;INTERVAL=1;BYDAY=WE')).toBe('Wed');
  });

  it('falls back to the interval form for multiple weekdays', () => {
    expect(shortRecurrenceLabel('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,FR')).toBe('1w');
  });

  it('returns null without a rule', () => {
    expect(shortRecurrenceLabel(null)).toBeNull();
  });
});
