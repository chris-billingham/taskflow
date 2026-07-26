/**
 * @mention extraction for comment bodies.
 *
 * Comments are stored as plain text with no mention markup, so mentions are
 * recognised by shape: "@" followed by a run of name characters. There is no
 * autocomplete in the editor yet, which drives two deliberate choices:
 *
 * - Matching is forgiving about case and about which part of a name was typed
 *   (first name, last name, or the local part of an email address).
 * - Matching is strict about ambiguity. If "@alex" could mean two different
 *   people in the project, nobody is notified for that handle — silently
 *   picking one would put a colleague's name on a notice meant for someone
 *   else.
 */

// Stops at whitespace and at trailing punctuation so "@alice," and "@alice."
// resolve to "alice". Allows the interior dots, hyphens and underscores that
// appear in email local parts.
const MENTION_PATTERN = /@([\p{L}\p{N}][\p{L}\p{N}._-]*)/gu;

/** Distinct mention handles in a comment body, lowercased, order preserved. */
export function extractMentionHandles(content: string): string[] {
  const handles: string[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(MENTION_PATTERN)) {
    const handle = match[1].replace(/[._-]+$/, '').toLowerCase();
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    handles.push(handle);
  }

  return handles;
}

export interface MentionCandidate {
  id: string;
  name: string;
  email: string | null;
}

/** The handles a given user could plausibly be addressed by. */
function handlesFor(candidate: MentionCandidate): Set<string> {
  const handles = new Set<string>();
  const name = candidate.name?.trim().toLowerCase() ?? '';

  if (name) {
    // Whole name with the spaces removed ("Ada Lovelace" -> "adalovelace"),
    // plus each individual word.
    handles.add(name.replace(/\s+/g, ''));
    for (const word of name.split(/\s+/)) {
      if (word) handles.add(word);
    }
  }

  const localPart = candidate.email?.split('@')[0]?.trim().toLowerCase();
  if (localPart) handles.add(localPart);

  return handles;
}

/**
 * Resolve mention handles to user ids against the people who can see the task.
 *
 * Candidates must be pre-filtered to project/workspace members: resolving
 * against all users would let a comment notify — and confirm the existence of
 * — accounts outside the commenter's tenant.
 */
export function resolveMentions(
  content: string,
  candidates: MentionCandidate[],
): string[] {
  const handles = extractMentionHandles(content);
  if (handles.length === 0) return [];

  // handle -> matching user ids, so ambiguity is detectable.
  const byHandle = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    for (const handle of handlesFor(candidate)) {
      const ids = byHandle.get(handle) ?? new Set<string>();
      ids.add(candidate.id);
      byHandle.set(handle, ids);
    }
  }

  const resolved = new Set<string>();
  for (const handle of handles) {
    const ids = byHandle.get(handle);
    if (ids?.size === 1) {
      resolved.add([...ids][0]);
    }
  }

  return [...resolved];
}
