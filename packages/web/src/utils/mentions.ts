/**
 * Choosing the @handle to insert for a picked member.
 *
 * Keep the handle rules in sync with `resolveMentions` in
 * packages/api/src/utils/mentions.ts — that is the authority on which handles
 * resolve to whom. The server deliberately notifies NOBODY for an ambiguous
 * handle rather than guessing, so the picker's job is to insert one that is
 * unambiguous among the people who can see the task. Otherwise a user would
 * select a colleague from a list and silently not notify them.
 */

export interface MentionMember {
  id: string;
  name: string;
  email: string | null;
}

/** Every handle the server would accept for this member, shortest-first. */
function candidateHandles(member: MentionMember): string[] {
  const handles: string[] = [];
  const name = member.name?.trim().toLowerCase() ?? '';

  if (name) {
    for (const word of name.split(/\s+/)) {
      if (word) handles.push(word);
    }
    const joined = name.replace(/\s+/g, '');
    if (joined && !handles.includes(joined)) handles.push(joined);
  }

  const localPart = member.email?.split('@')[0]?.trim().toLowerCase();
  if (localPart && !handles.includes(localPart)) handles.push(localPart);

  // Shortest first: "@chris" reads better than "@chris.billingham" when it's
  // unambiguous, and the server accepts both.
  return handles.sort((a, b) => a.length - b.length);
}

/**
 * The shortest handle that identifies `member` and nobody else in `all`.
 * Falls back to the email local part, then the joined name, so there is always
 * something to insert even when a team has two people with the same name.
 */
export function preferredHandle(
  member: MentionMember,
  all: MentionMember[],
): string {
  const others = all.filter((m) => m.id !== member.id);
  const taken = new Set(others.flatMap(candidateHandles));

  for (const handle of candidateHandles(member)) {
    if (!taken.has(handle)) return handle;
  }

  return (
    member.email?.split('@')[0]?.trim().toLowerCase() ??
    member.name.trim().toLowerCase().replace(/\s+/g, '')
  );
}

/** True when this member cannot be addressed unambiguously at all. */
export function isUnresolvable(member: MentionMember, all: MentionMember[]): boolean {
  const others = all.filter((m) => m.id !== member.id);
  const taken = new Set(others.flatMap(candidateHandles));
  return candidateHandles(member).every((handle) => taken.has(handle));
}

export interface MentionQuery {
  /** Index of the "@" that opened the query. */
  start: number;
  /** Text typed after the "@", lowercased. */
  term: string;
}

/**
 * The in-progress @mention immediately before the caret, if any.
 *
 * Returns null unless the caret sits in a run of name characters that follows
 * an "@" which itself follows whitespace or the start of the text — so an email
 * address ("ada@example.com") never opens the picker.
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  let i = caret - 1;

  while (i >= 0 && /[\p{L}\p{N}._-]/u.test(text[i])) i--;
  if (i < 0 || text[i] !== '@') return null;

  const before = i > 0 ? text[i - 1] : '';
  if (before && !/\s/.test(before)) return null;

  return { start: i, term: text.slice(i + 1, caret).toLowerCase() };
}

/** Members matching a query term, by any part of their name or email. */
export function filterMembers(
  members: MentionMember[],
  term: string,
): MentionMember[] {
  if (!term) return members;
  return members.filter(
    (m) =>
      m.name.toLowerCase().includes(term) ||
      (m.email?.toLowerCase().includes(term) ?? false),
  );
}
