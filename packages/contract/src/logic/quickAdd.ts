import { buildRecurrence, type WeekdayCode } from './recurrence.js';

/**
 * Quick Add's shorthand ("Call mum tomorrow at 5pm p1 #Home @phone"), shared
 * by the server (which creates the task) and the web app (which highlights
 * the tokens as you type). Pure: resolving #project and @label names needs
 * the database, so those come back as names and the caller decides which
 * ones are real (unresolved ones stay in the task's text).
 */

export type QuickAddTokenType = 'priority' | 'project' | 'label' | 'duration' | 'recurrence' | 'time' | 'date';

export interface QuickAddToken {
  type: QuickAddTokenType;
  /** Position in the original text: text.slice(start, end) is the token. */
  start: number;
  end: number;
  /** The name after # or @, for project and label tokens. */
  name?: string;
}

export interface QuickAddParse {
  tokens: QuickAddToken[];
  priority?: number;
  projectName?: string;
  labelNames: string[];
  /** Minutes. */
  duration?: number;
  recurrenceRule?: string;
  /** HH:mm. */
  dueTime?: string;
  /** YYYY-MM-DD, relative to the `today` given. */
  dueDate?: string;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_CODES: Record<string, WeekdayCode> = {
  monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH', friday: 'FR', saturday: 'SA', sunday: 'SU',
};
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};
const WEEKDAY_RE = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDays = (d: Date, n: number) => {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  next.setDate(next.getDate() + n);
  return next;
};

/** The coming Monday, strictly after today (Sunday → tomorrow, Monday → in a week). */
const nextMonday = (today: Date) => addDays(today, ((8 - today.getDay()) % 7) || 7);

/** Date patterns, tried in order; each returns the date or null if the match isn't a real date. */
const DATE_PATTERNS: Array<[RegExp, (m: RegExpMatchArray, today: Date) => Date | null]> = [
  [/\btoday\b/i, (_m, today) => today],
  [/\btomorrow\b/i, (_m, today) => addDays(today, 1)],
  [/\bnext\s+week\b/i, (_m, today) => nextMonday(today)],
  [/\bin\s+(\d{1,3})\s+days?\b/i, (m, today) => addDays(today, parseInt(m[1], 10))],
  [
    /\b(\d{4})-(\d{2})-(\d{2})\b/,
    (m) => {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
    },
  ],
  [
    // "next Friday": that weekday in the week after this one.
    new RegExp(`\\bnext\\s+(${WEEKDAY_RE})\\b`, 'i'),
    (m, today) => {
      const monday = nextMonday(today);
      const target = WEEKDAYS.indexOf(m[1].toLowerCase());
      return addDays(monday, (target + 6) % 7);
    },
  ],
  [
    // A bare weekday: the next one, strictly in the future.
    new RegExp(`\\b(${WEEKDAY_RE})\\b`, 'i'),
    (m, today) => {
      let days = WEEKDAYS.indexOf(m[1].toLowerCase()) - today.getDay();
      if (days <= 0) days += 7;
      return addDays(today, days);
    },
  ],
  [
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/i,
    (m, today) => {
      const month = MONTHS[m[1].toLowerCase().slice(0, 3)];
      const day = parseInt(m[2], 10);
      const d = new Date(today.getFullYear(), month, day);
      if (d.getMonth() !== month) return null;
      // "Sep 27" typed on Sep 27 is today, not a year from now.
      if (d < new Date(today.getFullYear(), today.getMonth(), today.getDate())) d.setFullYear(d.getFullYear() + 1);
      return d;
    },
  ],
];

export interface QuickAddNames {
  /** Names of projects the user can add to; lets "#Home Renovation" span both words. */
  projects?: string[];
  /** Names of the user's labels, likewise for "@Waiting on". */
  labels?: string[];
}

/**
 * Where a #/@ token ends. Normally at the first space; when known names are
 * given, the longest run of words that exactly names one (any case) wins, so
 * multi-word names work.
 */
function tokenEnd(text: string, nameStart: number, known: string[] | undefined): number {
  const firstEnd = text.slice(nameStart).search(/\s|$/) + nameStart;
  if (!known?.length) return firstEnd;
  const names = new Set(known.map((n) => n.toLowerCase()));
  let best = names.has(text.slice(nameStart, firstEnd).toLowerCase()) ? firstEnd : -1;
  let end = firstEnd;
  for (let words = 1; words < 6 && end < text.length; words++) {
    const next = text.slice(end).match(/^\s+\S+/);
    if (!next) break;
    end += next[0].length;
    if (names.has(text.slice(nameStart, end).replace(/\s+/g, ' ').toLowerCase())) best = end;
  }
  return best === -1 ? firstEnd : best;
}

/**
 * Find the shorthand in `text`. `today` is the user's calendar date (its
 * year/month/day are used as-is). The first match of each kind wins, and
 * tokens never overlap ("every Monday" is a repeat, not also a date).
 */
export function parseQuickAddText(text: string, today: Date, names: QuickAddNames = {}): QuickAddParse {
  const tokens: QuickAddToken[] = [];
  const result: QuickAddParse = { tokens, labelNames: [] };
  const free = (start: number, end: number) => tokens.every((t) => end <= t.start || start >= t.end);

  /** First match of `re` in a free span, optionally ignoring a leading group (the space before #/@). */
  const find = (re: RegExp, lead = false): { m: RegExpExecArray; start: number; end: number } | null => {
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = global.exec(text))) {
      const start = m.index + (lead ? m[0].length - m[0].trimStart().length : 0);
      const end = m.index + m[0].length;
      if (free(start, end)) return { m, start, end };
      if (m[0].length === 0) global.lastIndex++;
    }
    return null;
  };

  const priority = find(/\b[pP]([1-4])\b/);
  if (priority) {
    tokens.push({ type: 'priority', start: priority.start, end: priority.end });
    result.priority = Number(priority.m[1]);
  } else {
    // Sigils only when standalone ("call mum !!"), never "Ship it!".
    const bangs = find(/(?:^|\s)(!{1,3})(?=\s|$)/, true);
    if (bangs) {
      tokens.push({ type: 'priority', start: bangs.start, end: bangs.end });
      result.priority = Math.max(1, 4 - bangs.m[1].length);
    }
  }

  // #project and @label must start a word, so "issue#42" and email
  // addresses stay text.
  const nameToken = (type: 'project' | 'label', found: { start: number }, known: string[] | undefined) => {
    const end = tokenEnd(text, found.start + 1, known);
    const name = text.slice(found.start + 1, end).replace(/\s+/g, ' ');
    return { type, start: found.start, end, name } as QuickAddToken;
  };
  const project = find(/(?:^|\s)#(\S+)/, true);
  if (project) {
    const token = nameToken('project', project, names.projects);
    tokens.push(token);
    result.projectName = token.name;
  }
  for (;;) {
    const label = find(/(?:^|\s)@(\S+)/, true);
    if (!label) break;
    const token = nameToken('label', label, names.labels);
    tokens.push(token);
    result.labelNames.push(token.name!);
  }

  const duration = find(/\bfor\s+(?:(\d+)h)?(?:(\d+)m)?\b/i);
  if (duration && (duration.m[1] || duration.m[2])) {
    tokens.push({ type: 'duration', start: duration.start, end: duration.end });
    result.duration = parseInt(duration.m[1] || '0', 10) * 60 + parseInt(duration.m[2] || '0', 10);
  }

  const repeat = find(new RegExp(`\\bevery\\s+(?:(\\d+)\\s+)?(day|week|month|year|weekday|${WEEKDAY_RE})s?\\b`, 'i'));
  if (repeat) {
    tokens.push({ type: 'recurrence', start: repeat.start, end: repeat.end });
    const interval = Math.min(Math.max(parseInt(repeat.m[1] || '1', 10) || 1, 1), 999);
    const unit = repeat.m[2].toLowerCase();
    result.recurrenceRule =
      unit === 'weekday'
        ? buildRecurrence({ freq: 'WEEKLY', byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] })
        : WEEKDAY_CODES[unit]
          ? buildRecurrence({ freq: 'WEEKLY', byDay: [WEEKDAY_CODES[unit]] })
          : buildRecurrence({
              freq: ({ day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' } as const)[unit as 'day'],
              interval,
            });
  }

  const time = find(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (time) {
    let hours = parseInt(time.m[1], 10);
    const minutes = parseInt(time.m[2] || '0', 10);
    const meridiem = time.m[3]?.toLowerCase();
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    if (hours <= 23 && minutes <= 59 && (!meridiem || parseInt(time.m[1], 10) <= 12)) {
      tokens.push({ type: 'time', start: time.start, end: time.end });
      result.dueTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  for (const [pattern, resolve] of DATE_PATTERNS) {
    const date = find(pattern);
    if (!date) continue;
    const d = resolve(date.m, today);
    if (!d) continue;
    tokens.push({ type: 'date', start: date.start, end: date.end });
    result.dueDate = ymd(d);
    break;
  }

  tokens.sort((a, b) => a.start - b.start);
  return result;
}

/** The text with the given tokens taken out: the task's name. */
export function textWithoutTokens(text: string, tokens: QuickAddToken[]): string {
  let out = '';
  let at = 0;
  for (const t of [...tokens].sort((a, b) => a.start - b.start)) {
    out += `${text.slice(at, t.start)} `;
    at = t.end;
  }
  out += text.slice(at);
  return out.replace(/\s+/g, ' ').trim();
}
