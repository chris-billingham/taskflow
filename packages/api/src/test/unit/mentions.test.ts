import { describe, it, expect } from 'vitest';
import { extractMentionHandles, resolveMentions } from '../../utils/mentions.js';

const ada = { id: 'u-ada', name: 'Ada Lovelace', email: 'ada@example.com' };
const alan = { id: 'u-alan', name: 'Alan Turing', email: 'alan@example.com' };
const otherAda = { id: 'u-ada2', name: 'Ada Byron', email: 'ada.byron@example.com' };

describe('extractMentionHandles', () => {
  it('finds a single handle', () => {
    expect(extractMentionHandles('hey @ada can you look?')).toEqual(['ada']);
  });

  it('finds several and preserves order', () => {
    expect(extractMentionHandles('@ada and @alan please review')).toEqual(['ada', 'alan']);
  });

  it('de-duplicates repeats', () => {
    expect(extractMentionHandles('@ada @ada @ada')).toEqual(['ada']);
  });

  it('is case-insensitive', () => {
    expect(extractMentionHandles('@Ada @ADA')).toEqual(['ada']);
  });

  it('strips trailing punctuation', () => {
    expect(extractMentionHandles('thanks @ada, and @alan.')).toEqual(['ada', 'alan']);
  });

  it('keeps interior separators from email local parts', () => {
    expect(extractMentionHandles('@ada.byron ping')).toEqual(['ada.byron']);
  });

  it('handles a mention at the very start and end', () => {
    expect(extractMentionHandles('@ada')).toEqual(['ada']);
  });

  it('returns nothing when there are no mentions', () => {
    expect(extractMentionHandles('no mentions here')).toEqual([]);
  });

  it('ignores a bare @ and an email-looking string\'s domain', () => {
    // The local part before @ is not a mention, and "@" alone matches nothing.
    expect(extractMentionHandles('mail me at ada@example.com or @')).toEqual([
      'example.com',
    ]);
  });

  it('supports non-ASCII names', () => {
    expect(extractMentionHandles('@José vale?')).toEqual(['josé']);
  });
});

describe('resolveMentions', () => {
  it('resolves a first name', () => {
    expect(resolveMentions('@ada hello', [ada, alan])).toEqual(['u-ada']);
  });

  it('resolves a surname', () => {
    expect(resolveMentions('@turing hello', [ada, alan])).toEqual(['u-alan']);
  });

  it('resolves a full name with the space removed', () => {
    expect(resolveMentions('@adalovelace hello', [ada, alan])).toEqual(['u-ada']);
  });

  it('resolves an email local part', () => {
    expect(resolveMentions('@ada.byron hello', [ada, alan, otherAda])).toEqual(['u-ada2']);
  });

  it('resolves several distinct people', () => {
    const result = resolveMentions('@ada and @alan', [ada, alan]);
    expect(result.sort()).toEqual(['u-ada', 'u-alan']);
  });

  it('notifies nobody for an ambiguous handle', () => {
    // Two Adas in the project: guessing one would attribute the mention to the
    // wrong colleague, so neither is notified.
    expect(resolveMentions('@ada hello', [ada, otherAda])).toEqual([]);
  });

  it('still resolves the unambiguous handles alongside an ambiguous one', () => {
    expect(resolveMentions('@ada and @alan', [ada, otherAda, alan])).toEqual(['u-alan']);
  });

  it('ignores handles that match nobody', () => {
    expect(resolveMentions('@nobody here', [ada, alan])).toEqual([]);
  });

  it('returns nothing when the candidate list is empty', () => {
    expect(resolveMentions('@ada', [])).toEqual([]);
  });

  it('tolerates a candidate with no email', () => {
    const noEmail = { id: 'u-x', name: 'Grace Hopper', email: null };
    expect(resolveMentions('@grace hi', [noEmail])).toEqual(['u-x']);
  });
});
