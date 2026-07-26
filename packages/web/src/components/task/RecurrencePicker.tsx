import { useState, useRef, useEffect } from 'react';
import { Repeat, X } from 'lucide-react';
import {
  RECURRENCE_PRESETS,
  WEEKDAY_CODES,
  buildRecurrence,
  describeRecurrence,
  parseRecurrence,
  type Frequency,
  type WeekdayCode,
} from '@/utils/recurrence';

interface RecurrencePickerProps {
  isRecurring: boolean;
  recurrenceRule: string | null;
  /** null clears the series; a rule string sets or replaces it. */
  onChange: (rule: string | null) => void;
}

const FREQ_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'DAILY', label: 'days' },
  { value: 'WEEKLY', label: 'weeks' },
  { value: 'MONTHLY', label: 'months' },
  { value: 'YEARLY', label: 'years' },
];

const DAY_INITIALS: Record<WeekdayCode, string> = {
  MO: 'M', TU: 'T', WE: 'W', TH: 'T', FR: 'F', SA: 'S', SU: 'S',
};

export function RecurrencePicker({
  isRecurring,
  recurrenceRule,
  onChange,
}: RecurrencePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = isRecurring && !!recurrenceRule;
  const summary = active ? describeRecurrence(recurrenceRule) : null;

  // Custom-editor state, seeded from the current rule so opening it doesn't
  // silently discard what's already set.
  const parsed = parseRecurrence(recurrenceRule);
  const [freq, setFreq] = useState<Frequency>(parsed?.freq ?? 'WEEKLY');
  const [interval, setInterval] = useState(parsed?.interval ?? 1);
  const [byDay, setByDay] = useState<WeekdayCode[]>(parsed?.byDay ?? []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowCustom(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openCustom = () => {
    const current = parseRecurrence(recurrenceRule);
    setFreq(current?.freq ?? 'WEEKLY');
    setInterval(current?.interval ?? 1);
    setByDay(current?.byDay ?? []);
    setShowCustom(true);
  };

  const apply = (rule: string | null) => {
    onChange(rule);
    setIsOpen(false);
    setShowCustom(false);
  };

  const toggleDay = (code: WeekdayCode) => {
    setByDay((prev) =>
      prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code],
    );
  };

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-1.5 text-sm px-2 py-1 rounded transition-colors ${
            active
              ? 'text-[#db4c3f] hover:bg-red-50 dark:hover:bg-red-900/20'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <Repeat className="w-4 h-4" />
          {summary ?? 'Does not repeat'}
        </button>

        {active && (
          <button
            type="button"
            onClick={() => apply(null)}
            title="Stop repeating"
            aria-label="Stop repeating"
            className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1">
          {!showCustom ? (
            <>
              <button
                type="button"
                onClick={() => apply(null)}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  !active ? 'text-[#db4c3f] font-medium' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                Does not repeat
              </button>

              <hr className="my-1 border-gray-100 dark:border-gray-700" />

              {RECURRENCE_PRESETS.map((preset) => (
                <button
                  key={preset.rule}
                  type="button"
                  onClick={() => apply(preset.rule)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    recurrenceRule === preset.rule
                      ? 'text-[#db4c3f] font-medium'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {preset.label}
                </button>
              ))}

              <hr className="my-1 border-gray-100 dark:border-gray-700" />

              <button
                type="button"
                onClick={openCustom}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Custom…
              </button>
            </>
          ) : (
            <div className="px-3 py-2 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Every</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={interval}
                  onChange={(e) =>
                    setInterval(Math.max(1, Math.min(365, Number(e.target.value) || 1)))
                  }
                  aria-label="Repeat interval"
                  className="w-16 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-2 py-1"
                />
                <select
                  value={freq}
                  onChange={(e) => setFreq(e.target.value as Frequency)}
                  aria-label="Repeat unit"
                  className="flex-1 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-2 py-1"
                >
                  {FREQ_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* BYDAY is only meaningful for weekly rules server-side, so it
                  is offered only there rather than being silently ignored. */}
              {freq === 'WEEKLY' && (
                <div className="flex gap-1">
                  {WEEKDAY_CODES.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => toggleDay(code)}
                      aria-label={code}
                      aria-pressed={byDay.includes(code)}
                      className={`w-7 h-7 rounded-full text-xs font-medium transition-colors ${
                        byDay.includes(code)
                          ? 'bg-[#db4c3f] text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {DAY_INITIALS[code]}
                    </button>
                  ))}
                </div>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-400">
                {describeRecurrence(buildRecurrence({ freq, interval, byDay }))}
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => apply(buildRecurrence({ freq, interval, byDay }))}
                  className="flex-1 px-2 py-1 text-xs bg-[#db4c3f] text-white rounded hover:bg-[#c53727]"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustom(false)}
                  className="flex-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
