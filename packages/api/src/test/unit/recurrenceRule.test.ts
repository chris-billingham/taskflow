import { describe, it, expect } from 'vitest';
import {
  isSupportedRecurrence,
  createTaskSchema,
  updateTaskSchema,
} from '@taskflow/contract';
import { parseRecurrenceText } from '../../utils/recurrence.js';

describe('isSupportedRecurrence', () => {
  it.each([
    'FREQ=DAILY',
    'FREQ=DAILY;INTERVAL=1',
    'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR',
    'FREQ=MONTHLY;COUNT=3',
    'FREQ=YEARLY;UNTIL=20271231',
    'FREQ=DAILY;UNTIL=20271231T235959Z',
    'FREQ=DAILY;UNTIL=2027-12-31',
    'freq=weekly;byday=mo',
    'FREQ=DAILY;COUNT=0',
    'FREQ=DAILY;INTERVAL=999',
  ])('accepts %s', (rule) => {
    expect(isSupportedRecurrence(rule)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['no FREQ', 'INTERVAL=2'],
    ['unknown FREQ', 'FREQ=HOURLY'],
    ['zero interval', 'FREQ=DAILY;INTERVAL=0'],
    ['interval too large', 'FREQ=DAILY;INTERVAL=1000'],
    ['non-numeric interval', 'FREQ=DAILY;INTERVAL=two'],
    ['bad weekday', 'FREQ=WEEKLY;BYDAY=MO,XX'],
    ['positional weekday', 'FREQ=MONTHLY;BYDAY=1MO'],
    ['count too large', 'FREQ=DAILY;COUNT=10000'],
    ['bad UNTIL', 'FREQ=DAILY;UNTIL=tomorrow'],
    ['unknown key', 'FREQ=DAILY;BYMONTH=1'],
    ['duplicate key', 'FREQ=DAILY;FREQ=WEEKLY'],
    ['missing value', 'FREQ'],
    ['two equals signs', 'FREQ=DAILY=WEEKLY'],
  ])('rejects %s', (_label, rule) => {
    expect(isSupportedRecurrence(rule)).toBe(false);
  });

  it('accepts every rule quick add can produce', () => {
    const phrases = [
      'every day', 'every 3 days', 'every week', 'every 2 weeks',
      'every month', 'every 6 months', 'every year', 'every monday',
      'every weekday', 'every 0 days', 'every 5000 days', 'something else',
    ];
    for (const phrase of phrases) {
      expect(isSupportedRecurrence(parseRecurrenceText(phrase)), phrase).toBe(true);
    }
  });
});

describe('task recurrenceRule validation', () => {
  it('rejects an unsupported rule on create with a readable message', () => {
    const result = createTaskSchema.safeParse({ content: 'x', projectId: 'p1', recurrenceRule: 'FREQ=HOURLY' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/Unsupported recurrence rule/);
  });

  it('accepts a supported rule on create', () => {
    const result = createTaskSchema.safeParse({ content: 'x', projectId: 'p1', recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO' });
    expect(result.success).toBe(true);
  });

  it('allows clearing the rule on update', () => {
    expect(updateTaskSchema.safeParse({ recurrenceRule: null }).success).toBe(true);
    expect(updateTaskSchema.safeParse({ recurrenceRule: 'nonsense' }).success).toBe(false);
  });
});
