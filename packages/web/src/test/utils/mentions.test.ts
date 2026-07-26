import { describe, it, expect } from 'vitest';
import {
  filterMembers,
  findMentionQuery,
  isUnresolvable,
  preferredHandle,
} from '@/utils/mentions';

const ada = { id: 'u-ada', name: 'Ada Lovelace', email: 'ada@example.com' };
const alan = { id: 'u-alan', name: 'Alan Turing', email: 'alan@example.com' };
const otherAda = { id: 'u-ada2', name: 'Ada Byron', email: 'ada.byron@example.com' };
const adaTwin = { id: 'u-ada3', name: 'Ada Lovelace', email: 'ada.l@example.com' };

describe('findMentionQuery', () => {
  it('detects a mention at the caret', () => {
    expect(findMentionQuery('hey @ad', 7)).toEqual({ start: 4, term: 'ad' });
  });

  it('detects a bare @ as an empty query', () => {
    expect(findMentionQuery('hey @', 5)).toEqual({ start: 4, term: '' });
  });

  it('detects a mention at the very start', () => {
    expect(findMentionQuery('@ada', 4)).toEqual({ start: 0, term: 'ada' });
  });

  it('lowercases the term', () => {
    expect(findMentionQuery('@AdA', 4)?.term).toBe('ada');
  });

  it('does not open on an email address', () => {
    // The "@" is preceded by a word character, so it isn't a mention.
    expect(findMentionQuery('mail ada@example', 16)).toBeNull();
  });

  it('returns null with no @ before the caret', () => {
    expect(findMentionQuery('just text', 9)).toBeNull();
  });

  it('returns null when the caret is before the @', () => {
    expect(findMentionQuery('hey @ada', 3)).toBeNull();
  });

  it('stops at whitespace so a finished mention does not reopen', () => {
    expect(findMentionQuery('hey @ada thanks', 15)).toBeNull();
  });

  it('tracks a mention mid-sentence', () => {
    expect(findMentionQuery('cc @al and others', 6)).toEqual({ start: 3, term: 'al' });
  });

  it('allows the separators that appear in email local parts', () => {
    expect(findMentionQuery('@ada.by', 7)?.term).toBe('ada.by');
  });
});

describe('preferredHandle', () => {
  it('uses the shortest unambiguous handle', () => {
    expect(preferredHandle(ada, [ada, alan])).toBe('ada');
  });

  it('escalates past a first name shared with someone else', () => {
    // Both are "Ada", so "ada" would resolve to nobody server-side.
    const handle = preferredHandle(ada, [ada, otherAda]);
    expect(handle).not.toBe('ada');
    expect(['lovelace', 'adalovelace']).toContain(handle);
  });

  it('falls back to the email local part when the whole name collides', () => {
    expect(preferredHandle(ada, [ada, adaTwin])).toBe('ada');
  });

  it('produces different handles for two identically-named people', () => {
    const first = preferredHandle(ada, [ada, adaTwin]);
    const second = preferredHandle(adaTwin, [ada, adaTwin]);
    expect(first).not.toBe(second);
  });

  it('handles a member with no email', () => {
    const noEmail = { id: 'u-x', name: 'Grace Hopper', email: null };
    expect(preferredHandle(noEmail, [noEmail])).toBe('grace');
  });

  it('is stable for a lone member', () => {
    expect(preferredHandle(ada, [ada])).toBe('ada');
  });

  it('never returns an empty handle', () => {
    for (const member of [ada, alan, otherAda, adaTwin]) {
      expect(preferredHandle(member, [ada, alan, otherAda, adaTwin])).not.toBe('');
    }
  });
});

describe('isUnresolvable', () => {
  it('is false when a distinguishing handle exists', () => {
    expect(isUnresolvable(ada, [ada, alan])).toBe(false);
  });

  it('is true when every handle collides', () => {
    // Same name AND the same email local part.
    const clash = { id: 'u-clash', name: 'Ada Lovelace', email: 'ada@other.example' };
    expect(isUnresolvable(ada, [ada, clash])).toBe(true);
  });
});

describe('filterMembers', () => {
  const all = [ada, alan, otherAda];

  it('returns everyone for an empty term', () => {
    expect(filterMembers(all, '')).toHaveLength(3);
  });

  it('matches on any part of the name', () => {
    expect(filterMembers(all, 'turing')).toEqual([alan]);
  });

  it('matches on email', () => {
    expect(filterMembers(all, 'ada.byron')).toEqual([otherAda]);
  });

  it('matches several members on a shared prefix', () => {
    expect(filterMembers(all, 'ada')).toHaveLength(2);
  });

  it('returns nothing for a term nobody matches', () => {
    expect(filterMembers(all, 'zzz')).toEqual([]);
  });

  it('tolerates a member with no email', () => {
    const noEmail = { id: 'u-x', name: 'Grace Hopper', email: null };
    expect(filterMembers([noEmail], 'grace')).toEqual([noEmail]);
    expect(filterMembers([noEmail], 'zzz')).toEqual([]);
  });
});
