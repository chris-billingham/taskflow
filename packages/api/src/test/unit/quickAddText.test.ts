import { describe, it, expect } from 'vitest';
import { parseQuickAddText, textWithoutTokens } from '@taskflow/contract';

// Wednesday 2026-09-30, the user's calendar day.
const today = new Date(2026, 8, 30);
const parse = (text: string) => parseQuickAddText(text, today);

describe('parseQuickAddText (shared with the web app)', () => {
  it('reports each token with its position', () => {
    const text = 'Call mum tomorrow at 5pm p1 #Home @phone';
    const { tokens } = parse(text);
    expect(tokens.map((t) => [t.type, text.slice(t.start, t.end)])).toEqual([
      ['date', 'tomorrow'],
      ['time', 'at 5pm'],
      ['priority', 'p1'],
      ['project', '#Home'],
      ['label', '@phone'],
    ]);
    expect(textWithoutTokens(text, tokens)).toBe('Call mum');
  });

  it('understands ISO dates, and rejects impossible ones', () => {
    expect(parse('Renew passport 2027-02-14').dueDate).toBe('2027-02-14');
    expect(parse('Renew passport 2027-02-31').dueDate).toBeUndefined();
  });

  it('"next Friday" is Friday of next week; a bare "Friday" is the coming one', () => {
    expect(parse('Pay rent next friday').dueDate).toBe('2026-10-09');
    expect(parse('Pay rent friday').dueDate).toBe('2026-10-02');
    expect(parse('Pay rent next monday').dueDate).toBe('2026-10-05');
    expect(parse('Plan next week').dueDate).toBe('2026-10-05');
  });

  it('repeats every weekday, and a repeat word is not also a date', () => {
    const r = parse('Stand-up every weekday');
    expect(r.recurrenceRule).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR');
    expect(parse('Gym every monday').dueDate).toBeUndefined();
  });

  it('ignores impossible times', () => {
    expect(parse('Meet at 25').dueTime).toBeUndefined();
    expect(parse('Meet at 13pm').dueTime).toBeUndefined();
    expect(parse('Meet at 9:30am').dueTime).toBe('09:30');
  });

  it('only treats # and @ at the start of a word as tokens', () => {
    const r = parse('Email ada@example.com about issue#42');
    expect(r.labelNames).toEqual([]);
    expect(r.projectName).toBeUndefined();
  });

  it('clamps a repeat interval to what the API accepts', () => {
    expect(parse('Check every 5000 days').recurrenceRule).toBe('FREQ=DAILY;INTERVAL=999');
  });
});

describe('multi-word names', () => {
  it('a known multi-word project or label is one token (longest match wins)', () => {
    const text = 'Paint hall #Home Renovation tomorrow @Waiting on';
    const r = parseQuickAddText(text, today, {
      projects: ['Home', 'Home Renovation'],
      labels: ['Waiting on'],
    });
    expect(r.projectName).toBe('Home Renovation');
    expect(r.labelNames).toEqual(['Waiting on']);
    expect(textWithoutTokens(text, r.tokens)).toBe('Paint hall');
  });

  it('without a known name, the token stops at the first space', () => {
    expect(parseQuickAddText('Paint #Home Renovation', today, { projects: ['Home'] }).projectName).toBe('Home');
    expect(parseQuickAddText('Paint #Home Renovation', today).projectName).toBe('Home');
  });
});
