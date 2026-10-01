import { useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  CalendarRange,
  Filter,
  Hash,
  Inbox,
  Keyboard,
  Plus,
  Search,
  Settings,
  Tag,
  Trash2, UserCheck } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useProjects } from '@/queries/projects';
import { useFilters } from '@/queries/filters';
import { useLabels } from '@/queries/labels';

interface Command {
  id: string;
  label: string;
  group: 'Actions' | 'Go to' | 'Projects' | 'Filters' | 'Labels';
  icon: LucideIcon;
  color?: string;
  run: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onQuickAdd: () => void;
  onSearch: () => void;
  onShortcuts: () => void;
}

/** ⌘K: jump anywhere or run an action by typing a few letters. */
export function CommandPalette({ isOpen, onClose, onQuickAdd, onSearch, onShortcuts }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { active: projects } = useProjects();
  const { filters } = useFilters();
  const { labels } = useLabels();
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => navigate(path);
    const inbox = projects.find((p) => p.isInbox);
    return [
      { id: 'add', label: 'Add task', group: 'Actions', icon: Plus, run: onQuickAdd },
      { id: 'search', label: 'Search', group: 'Actions', icon: Search, run: onSearch },
      { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'Actions', icon: Keyboard, run: onShortcuts },
      ...(inbox ? [{ id: 'inbox', label: 'Inbox', group: 'Go to' as const, icon: Inbox, run: go(`/projects/${inbox.id}`) }] : []),
      { id: 'today', label: 'Today', group: 'Go to', icon: CalendarDays, run: go('/today') },
      { id: 'upcoming', label: 'Upcoming', group: 'Go to', icon: CalendarRange, run: go('/upcoming') },
      { id: 'assigned', label: 'Assigned to me', group: 'Go to', icon: UserCheck, run: go('/assigned') },
      { id: 'filters-labels', label: 'Filters & Labels', group: 'Go to', icon: Filter, run: go('/filters-labels') },
      { id: 'trash', label: 'Trash', group: 'Go to', icon: Trash2, run: go('/trash') },
      { id: 'settings', label: 'Settings', group: 'Go to', icon: Settings, run: go('/settings') },
      ...projects
        .filter((p) => !p.isInbox)
        .map((p) => ({ id: `p-${p.id}`, label: p.name, group: 'Projects' as const, icon: Hash, color: p.color, run: go(`/projects/${p.id}`) })),
      ...filters.map((f) => ({ id: `f-${f.id}`, label: f.name, group: 'Filters' as const, icon: Filter, color: f.color, run: go(`/filters/${f.id}`) })),
      ...labels.map((l) => ({ id: `l-${l.id}`, label: l.name, group: 'Labels' as const, icon: Tag, color: l.color, run: go(`/labels/${l.id}`) })),
    ];
  }, [projects, filters, labels, navigate, onQuickAdd, onSearch, onShortcuts]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return commands;
    // Every typed word must appear, in any order ("up wo" finds "Upcoming work").
    const words = term.split(/\s+/);
    return commands.filter((c) => words.every((w) => `${c.label} ${c.group}`.toLowerCase().includes(w)));
  }, [commands, query]);

  const run = (command: Command) => {
    onClose();
    setQuery('');
    command.run();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && matches[highlighted]) {
      e.preventDefault();
      run(matches[highlighted]);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} ariaLabel="Command palette" size="lg" align="top">
      <div onKeyDown={onKeyDown}>
        <input
          autoFocus
          aria-label="Type a command or a place"
          aria-controls="command-results"
          aria-activedescendant={matches[highlighted] ? `command-${matches[highlighted].id}` : undefined}
          placeholder="Type a command or a place…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(0);
          }}
          className="w-full px-4 py-3 text-base bg-transparent border-b border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-hidden"
        />
        <ul id="command-results" role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto py-2">
          {matches.length === 0 && <li className="px-4 py-2 text-sm text-gray-400">Nothing matches “{query}”</li>}
          {matches.map((c, i) => {
            const Icon = c.icon;
            return (
              <li
                key={c.id}
                id={`command-${c.id}`}
                role="option"
                aria-selected={i === highlighted}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => run(c)}
                className={`flex items-center gap-3 px-4 py-2 text-sm cursor-pointer ${
                  i === highlighted ? 'bg-gray-100 dark:bg-gray-700' : ''
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" style={c.color ? { color: c.color } : undefined} aria-hidden="true" />
                <span className="flex-1 truncate text-gray-800 dark:text-gray-200">{c.label}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{c.group}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
