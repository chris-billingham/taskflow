import { type ChangeEvent } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

interface SearchInputProps {
  query: string;
  onChange: (value: string) => void;
  loading: boolean;
  autoFocus?: boolean;
}

export function SearchInput({ query, onChange, loading, autoFocus }: SearchInputProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-200 dark:border-gray-700">
      {loading ? (
        <Loader2 className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0 animate-spin" />
      ) : (
        <Search className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
      )}
      <input
        type="text"
        value={query}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder="Search tasks, projects, comments..."
        className="flex-1 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none bg-transparent"
        autoFocus={autoFocus}
      />
      <div className="flex items-center gap-2">
        {query ? (
          <button
            onClick={() => onChange('')}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Clear search"
          >
            <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          </button>
        ) : (
          <kbd className="hidden sm:flex items-center px-1.5 py-0.5 text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-700">
            /
          </kbd>
        )}
      </div>
    </div>
  );
}
