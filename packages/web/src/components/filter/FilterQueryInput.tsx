import { useState, useRef, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useFilterStore } from '@/stores/filterStore';
import { useLabelStore, selectLabelsArray } from '@/stores/labelStore';
import { useProjectStore, selectProjectsArray } from '@/stores/projectStore';

interface FilterQueryInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidation?: (result: { valid: boolean; error?: string }) => void;
  placeholder?: string;
}

const OPERATORS = [
  { trigger: 'today', label: 'today', desc: 'Tasks due today' },
  { trigger: 'tomorrow', label: 'tomorrow', desc: 'Tasks due tomorrow' },
  { trigger: 'overdue', label: 'overdue', desc: 'Overdue tasks' },
  { trigger: 'no date', label: 'no date', desc: 'Tasks without due date' },
  { trigger: 'p1', label: 'p1', desc: 'Priority 1 (highest)' },
  { trigger: 'p2', label: 'p2', desc: 'Priority 2' },
  { trigger: 'p3', label: 'p3', desc: 'Priority 3' },
  { trigger: 'p4', label: 'p4', desc: 'Priority 4 (lowest)' },
  { trigger: 'recurring', label: 'recurring', desc: 'Recurring tasks' },
  { trigger: '!recurring', label: '!recurring', desc: 'Non-recurring tasks' },
  { trigger: 'completed', label: 'completed', desc: 'Completed tasks' },
  { trigger: '!completed', label: '!completed', desc: 'Incomplete tasks' },
  { trigger: 'assigned to: me', label: 'assigned to: me', desc: 'Assigned to you' },
  { trigger: 'due:', label: 'due: <date>', desc: 'Due on specific date' },
  { trigger: 'due before:', label: 'due before: <date>', desc: 'Due before date' },
  { trigger: 'due after:', label: 'due after: <date>', desc: 'Due after date' },
  { trigger: 'search:', label: 'search: <keyword>', desc: 'Search task content' },
  { trigger: 'created:', label: 'created: <date>', desc: 'Created on date' },
];

export function FilterQueryInput({ value, onChange, onValidation, placeholder }: FilterQueryInputProps) {
  const [suggestions, setSuggestions] = useState<typeof OPERATORS>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [validation, setValidation] = useState<{ valid: boolean; error?: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const validateTimer = useRef<ReturnType<typeof setTimeout>>();

  const validateFilter = useFilterStore((s) => s.validateFilter);
  const labels = useLabelStore(selectLabelsArray);
  const projects = useProjectStore(selectProjectsArray);

  const debounceValidate = useCallback(
    (query: string) => {
      if (validateTimer.current) clearTimeout(validateTimer.current);
      if (!query.trim()) {
        setValidation(null);
        onValidation?.({ valid: true });
        return;
      }
      validateTimer.current = setTimeout(async () => {
        try {
          const result = await validateFilter(query);
          setValidation(result);
          onValidation?.(result);
        } catch {
          setValidation({ valid: false, error: 'Validation failed' });
        }
      }, 500);
    },
    [validateFilter, onValidation],
  );

  useEffect(() => {
    debounceValidate(value);
    return () => {
      if (validateTimer.current) clearTimeout(validateTimer.current);
    };
  }, [value, debounceValidate]);

  const updateSuggestions = (text: string) => {
    // Get the last "segment" after operators
    const lastSegment = text.split(/[&|()]/).pop()?.trim().toLowerCase() || '';

    if (!lastSegment) {
      setShowSuggestions(false);
      return;
    }

    const allSuggestions: typeof OPERATORS = [];

    // Match operators
    const matchingOps = OPERATORS.filter(
      (op) => op.trigger.toLowerCase().startsWith(lastSegment) && op.trigger !== lastSegment,
    );
    allSuggestions.push(...matchingOps);

    // Match labels with @
    if (lastSegment.startsWith('@')) {
      const labelQuery = lastSegment.slice(1);
      const matchingLabels = labels
        .filter((l) => l.name.toLowerCase().startsWith(labelQuery))
        .map((l) => ({
          trigger: `@${l.name}`,
          label: `@${l.name}`,
          desc: 'Label',
        }));
      allSuggestions.push(...matchingLabels);
    }

    // Match projects with #
    if (lastSegment.startsWith('#')) {
      const projectQuery = lastSegment.slice(1);
      const matchingProjects = projects
        .filter((p) => p.name.toLowerCase().startsWith(projectQuery))
        .map((p) => ({
          trigger: `#${p.name}`,
          label: `#${p.name}`,
          desc: 'Project',
        }));
      allSuggestions.push(...matchingProjects);
    }

    setSuggestions(allSuggestions.slice(0, 8));
    setShowSuggestions(allSuggestions.length > 0);
    setSelectedIndex(0);
  };

  const applySuggestion = (suggestion: (typeof OPERATORS)[0]) => {
    // Replace the last segment with the suggestion
    const parts = value.split(/([&|()])/);
    parts[parts.length - 1] = ' ' + suggestion.trigger;
    onChange(parts.join('').trim());
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (suggestions[selectedIndex]) {
        e.preventDefault();
        applySuggestion(suggestions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none pr-8 font-mono ${
            validation && !validation.valid
              ? 'border-red-300 dark:border-red-800 focus:border-red-500'
              : 'border-gray-200 dark:border-gray-700 focus:border-[#db4c3f]'
          }`}
          placeholder={placeholder || 'e.g. today & p1 & @work'}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            updateSuggestions(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => updateSuggestions(value)}
          onBlur={() => {
            // Delay to allow click on suggestion
            setTimeout(() => setShowSuggestions(false), 200);
          }}
        />
        {validation && value.trim() && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            {validation.valid ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-500" />
            )}
          </div>
        )}
      </div>

      {validation && !validation.valid && validation.error && (
        <p className="mt-1 text-xs text-red-500">{validation.error}</p>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute top-full left-0 mt-1 w-full z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 max-h-48 overflow-y-auto"
        >
          {suggestions.map((s, i) => (
            <button
              key={s.trigger}
              className={`w-full flex items-center justify-between px-3 py-1.5 text-sm ${
                i === selectedIndex ? 'bg-gray-100 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              onMouseDown={() => applySuggestion(s)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="font-mono text-[#db4c3f]">{s.label}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">{s.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
