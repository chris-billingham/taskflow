import { useState, useRef, useEffect, useLayoutEffect, useMemo, type KeyboardEvent } from 'react';
import { Plus, Calendar, Clock, Flag, Hash, Repeat, Tag, Timer, User as UserIcon } from 'lucide-react';
import { matchPerson, parseQuickAddText, type QuickAddToken } from '@taskflow/contract';
import { useProjects } from '@/queries/projects';
import { useLabels, useLabelActions, useProjectLabels } from '@/queries/labels';
import { useProjectMembers } from '@/queries/taskExtras';
import { useAuthStore } from '@/stores/authStore';
import { describeRecurrence } from '@/utils/recurrence';
import { formatUserDate, formatUserTime } from '@/utils/dateFormat';

interface QuickAddProps {
  /** The project the box adds to; the Inbox when absent (as on the server). */
  projectId?: string;
  sectionId?: string; // reserved for future section-scoped add
  parentId?: string; // reserved for future subtask add
  onSubmit: (text: string) => Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  inline?: boolean;
}

const priorityColors: Record<number, string> = {
  1: 'text-red-500',
  2: 'text-orange-500',
  3: 'text-blue-500',
  4: 'text-gray-400 dark:text-gray-500',
};

// Background colours only (never weight or size): the highlight layer must
// keep exactly the input's glyph widths or the caret drifts.
const TOKEN_STYLES: Record<QuickAddToken['type'], string> = {
  date: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  time: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  recurrence: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  duration: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  priority: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  project: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  label: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  assignee: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
};

interface Suggestion {
  key: string;
  label: string;
  insert: string;
  color?: string;
  create?: boolean;
}

const SIGILS: Record<string, 'project' | 'label' | 'person'> = { '#': 'project', '@': 'label', '+': 'person' };

/** The #project, @label or +person being typed just before the caret, if any. */
function activeTag(text: string, caret: number): { kind: 'project' | 'label' | 'person'; start: number; term: string } | null {
  let i = caret - 1;
  while (i >= 0 && !/\s/.test(text[i]) && !SIGILS[text[i]]) i--;
  if (i < 0 || !SIGILS[text[i]]) return null;
  if (i > 0 && !/\s/.test(text[i - 1])) return null;
  return { kind: SIGILS[text[i]], start: i, term: text.slice(i + 1, caret) };
}

/** 90 → "1h 30m", 45 → "45m", 120 → "2h". */
const formatDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
};

const localYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function dateLabel(ymd: string): string {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (ymd === localYmd(today)) return 'Today';
  if (ymd === localYmd(tomorrow)) return 'Tomorrow';
  const [y, m, d] = ymd.split('-').map(Number);
  return formatUserDate(new Date(y, m - 1, d));
}

export function QuickAdd({
  projectId,
  onSubmit,
  placeholder = 'Add task',
  autoFocus,
  onCancel,
  inline = true,
}: QuickAddProps) {
  const [isExpanded, setIsExpanded] = useState(autoFocus || false);
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [highlighted, setHighlighted] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // Where to put the caret once new text renders (after inserting a
  // suggestion). Applied before the next event, so fast typing lands after it.
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (pendingCaret.current === null || !input) return;
    input.focus();
    input.setSelectionRange(pendingCaret.current, pendingCaret.current);
    setCaret(pendingCaret.current);
    pendingCaret.current = null;
  }, [text]);

  const { active: projects } = useProjects();
  const me = useAuthStore((s) => s.user?.id);
  // Every label name you can use, so multi-word ones tokenise as one.
  const { labels: visibleLabels } = useLabels();
  const { createLabel } = useLabelActions();

  useEffect(() => {
    if (isExpanded && inputRef.current) inputRef.current.focus();
  }, [isExpanded]);

  const projectNames = useMemo(() => projects.map((p) => p.name), [projects]);
  const visibleNames = useMemo(() => visibleLabels.map((l) => l.name), [visibleLabels]);
  // The same parser the server runs, so what's highlighted is what happens.
  // Names of the people in this box's project, so "+Sam Smith" is one token.
  const inboxId = projects.find((p) => p.isInbox && p.ownerId === me)?.id;
  const { members: boxPeople } = useProjectMembers(projectId ?? inboxId);
  const peopleNames = useMemo(() => boxPeople.map((p) => p.name), [boxPeople]);
  const parsed = useMemo(
    () => parseQuickAddText(text, new Date(), { projects: projectNames, labels: visibleNames, people: peopleNames }),
    [text, projectNames, visibleNames, peopleNames],
  );
  // @labels come from the project the task lands in: the one named with #,
  // else this box's project, else the Inbox.
  const namedProject = parsed.projectName
    ? projects.find((p) => p.name.toLowerCase() === parsed.projectName!.toLowerCase())
    : undefined;
  const targetProjectId = namedProject?.id ?? projectId ?? inboxId;
  const { labels } = useProjectLabels(targetProjectId);
  const labelNames = useMemo(() => labels.map((l) => l.name), [labels]);
  // +person: the people who can be assigned in that project.
  const { members: people } = useProjectMembers(targetProjectId);
  const assigneeId = parsed.assigneeName && me ? matchPerson(parsed.assigneeName, people, me) : null;
  const assignee = people.find((p) => p.id === assigneeId);
  const isKnown = (token: QuickAddToken) => {
    if (token.type === 'assignee') return Boolean(assignee);
    if (token.type !== 'project' && token.type !== 'label') return true;
    const names = token.type === 'project' ? projectNames : labelNames;
    return names.some((n) => n.toLowerCase() === token.name!.toLowerCase());
  };

  // Autocomplete for the #project / @label under the caret.
  const tag = dismissedAt === caret ? null : activeTag(text, caret);
  const suggestions = useMemo<Suggestion[]>(() => {
    if (!tag) return [];
    const term = tag.term.toLowerCase();
    if (tag.kind === 'project') {
      return projects
        .filter((p) => p.name.toLowerCase().includes(term))
        .slice(0, 6)
        .map((p) => ({ key: p.id, label: p.name, insert: `#${p.name}`, color: p.color }));
    }
    if (tag.kind === 'person') {
      return people
        .filter((p) => p.name.toLowerCase().includes(term))
        .slice(0, 6)
        .map((p) => ({ key: p.id, label: p.id === me ? `${p.name} (me)` : p.name, insert: `+${p.name}` }));
    }
    const matches = labels
      .filter((l) => l.name.toLowerCase().includes(term))
      .slice(0, 6)
      .map((l) => ({ key: l.id, label: l.name, insert: `@${l.name}`, color: l.color }));
    const exact = labels.some((l) => l.name.toLowerCase() === term);
    return term && !exact
      ? [...matches, { key: 'create', label: `Create label “${tag.term}”`, insert: `@${tag.term}`, create: true }]
      : matches;
  }, [tag, projects, labels, people, me]);
  const showSuggestions = suggestions.length > 0;

  const choose = async (s: Suggestion) => {
    if (!tag) return;
    if (s.create) {
      try {
        await createLabel({ name: tag.term, projectId: targetProjectId });
      } catch {
        return; // already reported
      }
    }
    const before = text.slice(0, tag.start) + s.insert + ' ';
    const next = before + text.slice(caret).replace(/^\s+/, '');
    pendingCaret.current = before.length;
    setText(next);
    setHighlighted(0);
  };

  const handleSubmit = async () => {
    if (!text.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(text.trim());
      setText('');
      setCaret(0);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setText('');
    setIsExpanded(false);
    onCancel?.();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        void choose(suggestions[Math.min(highlighted, suggestions.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        // Close the suggestions, not the whole box.
        e.preventDefault();
        setDismissedAt(caret);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
    if (e.key === 'Escape') handleCancel();
  };

  const syncCaret = () => {
    const input = inputRef.current;
    if (!input) return;
    setCaret(input.selectionStart ?? input.value.length);
    if (overlayRef.current) overlayRef.current.scrollLeft = input.scrollLeft;
  };

  if (!isExpanded && inline) {
    return (
      <button
        className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-500 transition-colors rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
        onClick={() => setIsExpanded(true)}
      >
        <Plus className="w-4 h-4" />
        {placeholder}
      </button>
    );
  }

  // The text split into plain runs and highlighted tokens.
  const segments: Array<{ text: string; token?: QuickAddToken }> = [];
  let at = 0;
  for (const token of parsed.tokens) {
    if (token.start > at) segments.push({ text: text.slice(at, token.start) });
    segments.push({ text: text.slice(token.start, token.end), token });
    at = token.end;
  }
  if (at < text.length) segments.push({ text: text.slice(at) });

  const knownProject = parsed.tokens.find((t) => t.type === 'project' && isKnown(t))?.name;
  const knownLabels = parsed.tokens.filter((t) => t.type === 'label' && isKnown(t)).map((t) => t.name!);
  const repeat = describeRecurrence(parsed.recurrenceRule);
  const hasPreview =
    parsed.dueDate ||
    parsed.dueTime ||
    parsed.priority ||
    knownProject ||
    knownLabels.length ||
    assignee ||
    repeat ||
    parsed.duration;

  return (
    <div className={`${inline ? 'border border-gray-200 dark:border-gray-700 rounded-lg' : ''}`}>
      <div className="p-2">
        <div className="relative">
          <div
            ref={overlayRef}
            aria-hidden="true"
            className="absolute inset-0 overflow-hidden whitespace-pre text-sm py-1 text-gray-900 dark:text-white pointer-events-none"
          >
            {segments.map((s, i) =>
              s.token ? (
                <mark
                  key={i}
                  className={`rounded-sm ${isKnown(s.token) ? TOKEN_STYLES[s.token.type] : 'bg-transparent text-gray-400 dark:text-gray-500'}`}
                >
                  {s.text}
                </mark>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </div>
          <input
            ref={inputRef}
            className="relative w-full text-sm bg-transparent outline-hidden placeholder-gray-400 dark:placeholder-gray-500 py-1 text-transparent caret-gray-900 dark:caret-white"
            placeholder={`${placeholder} (use #project, @label, p1-4, today, tomorrow...)`}
            aria-label={placeholder}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
            aria-controls={showSuggestions ? 'quick-add-suggestions' : undefined}
            aria-activedescendant={showSuggestions ? `quick-add-${suggestions[Math.min(highlighted, suggestions.length - 1)].key}` : undefined}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setHighlighted(0);
              setDismissedAt(null);
              syncCaret();
            }}
            onSelect={syncCaret}
            onKeyUp={syncCaret}
            onScroll={syncCaret}
            onKeyDown={onKeyDown}
          />
          {showSuggestions && (
            <ul
              id="quick-add-suggestions"
              role="listbox"
              aria-label={tag?.kind === 'project' ? 'Projects' : tag?.kind === 'person' ? 'People' : 'Labels'}
              className="absolute left-0 top-full mt-1 z-30 w-64 max-h-60 overflow-y-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1"
            >
              {suggestions.map((s, i) => (
                <li
                  key={s.key}
                  id={`quick-add-${s.key}`}
                  role="option"
                  aria-selected={i === highlighted}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void choose(s);
                  }}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer ${
                    i === highlighted ? 'bg-gray-100 dark:bg-gray-700' : ''
                  } ${s.create ? 'text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-200'}`}
                >
                  {s.create ? (
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : tag?.kind === 'project' ? (
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} aria-hidden="true" />
                  ) : tag?.kind === 'person' ? (
                    <UserIcon className="w-3.5 h-3.5 shrink-0 text-gray-400" aria-hidden="true" />
                  ) : (
                    <Tag className="w-3.5 h-3.5 shrink-0" style={{ color: s.color }} aria-hidden="true" />
                  )}
                  <span className="truncate">{s.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* What the task will get */}
        {hasPreview && (
          <div role="group" aria-label="Task details from the text" className="flex items-center gap-2 mt-1 flex-wrap">
            {parsed.dueDate && (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded-sm">
                <Calendar className="w-3 h-3" aria-hidden="true" />
                {dateLabel(parsed.dueDate)}
              </span>
            )}
            {parsed.dueTime && (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded-sm">
                <Clock className="w-3 h-3" aria-hidden="true" />
                {formatUserTime(parsed.dueTime)}
              </span>
            )}
            {parsed.priority && (
              <span className={`flex items-center gap-1 text-xs ${priorityColors[parsed.priority]} bg-gray-50 dark:bg-gray-700 px-1.5 py-0.5 rounded-sm`}>
                <Flag className="w-3 h-3" fill={parsed.priority < 4 ? 'currentColor' : 'none'} aria-hidden="true" />
                P{parsed.priority}
              </span>
            )}
            {knownProject && (
              <span className="flex items-center gap-1 text-xs text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 px-1.5 py-0.5 rounded-sm">
                <Hash className="w-3 h-3" aria-hidden="true" />#{projectNames.find((n) => n.toLowerCase() === knownProject.toLowerCase())}
              </span>
            )}
            {knownLabels.map((label) => (
              <span key={label} className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded-sm">
                <Tag className="w-3 h-3" aria-hidden="true" />
                {label}
              </span>
            ))}
            {assignee && (
              <span className="flex items-center gap-1 text-xs text-pink-700 dark:text-pink-300 bg-pink-50 dark:bg-pink-900/20 px-1.5 py-0.5 rounded-sm">
                <UserIcon className="w-3 h-3" aria-hidden="true" />
                {assignee.id === me ? 'Me' : assignee.name}
              </span>
            )}
            {repeat && (
              <span className="flex items-center gap-1 text-xs text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/20 px-1.5 py-0.5 rounded-sm">
                <Repeat className="w-3 h-3" aria-hidden="true" />
                {repeat}
              </span>
            )}
            {parsed.duration ? (
              <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-sm">
                <Timer className="w-3 h-3" aria-hidden="true" />
                {formatDuration(parsed.duration)}
              </span>
            ) : null}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-2 py-1.5 border-t border-gray-100 dark:border-gray-700">
        <button
          className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-sm"
          onClick={handleCancel}
        >
          Cancel
        </button>
        <button
          className="px-3 py-1 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-sm disabled:opacity-50"
          onClick={() => void handleSubmit()}
          disabled={!text.trim() || isSubmitting}
        >
          {isSubmitting ? 'Adding...' : 'Add task'}
        </button>
      </div>
    </div>
  );
}
