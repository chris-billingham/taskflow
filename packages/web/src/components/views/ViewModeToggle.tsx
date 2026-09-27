import { Calendar, LayoutGrid, List } from 'lucide-react';

export type ViewMode = 'list' | 'board' | 'calendar';

const MODES = [
  { mode: 'list', label: 'List view', Icon: List },
  { mode: 'board', label: 'Board view', Icon: LayoutGrid },
  { mode: 'calendar', label: 'Calendar view', Icon: Calendar },
] as const;

/** List / board / calendar switch for filter and label pages. */
export function ViewModeToggle({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="flex items-center gap-0.5 ml-2" role="group" aria-label="View">
      {MODES.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          type="button"
          className={`p-1 rounded transition-colors ${
            value === mode
              ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white'
              : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          onClick={() => onChange(mode)}
          aria-label={label}
          aria-pressed={value === mode}
          title={label}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}
