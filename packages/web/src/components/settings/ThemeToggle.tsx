import { Sun, Moon, Monitor } from 'lucide-react';

const options = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

type Theme = 'light' | 'dark' | 'system';

interface ThemeToggleProps {
  value: Theme;
  onChange: (theme: Theme) => void;
}

export function ThemeToggle({ value, onChange }: ThemeToggleProps) {
  return (
    <div className="flex gap-2">
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
            value === v
              ? 'border-[#db4c3f] bg-red-50 text-[#db4c3f] dark:bg-red-900/20'
              : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'
          }`}
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
