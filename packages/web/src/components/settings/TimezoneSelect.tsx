import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check } from 'lucide-react';

const ALL_TIMEZONES: string[] = (() => {
  try {
    return (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
      ? [Intl.DateTimeFormat().resolvedOptions().timeZone]
      : [];
  }
})();

function localTime(tz: string) {
  try {
    return new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

interface TimezoneSelectProps {
  value: string;
  onChange: (tz: string) => void;
}

export function TimezoneSelect({ value, onChange }: TimezoneSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? ALL_TIMEZONES.filter((tz) => tz.toLowerCase().includes(q)) : ALL_TIMEZONES;
  }, [search]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setSearch('');
  }, [open]);

  const handleSelect = (tz: string) => {
    onChange(tz);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#db4c3f] dark:bg-gray-800 dark:border-gray-600 dark:text-white"
      >
        <span className="truncate">{value || 'Select timezone'}</span>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className="text-xs text-gray-400">{localTime(value)}</span>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg dark:bg-gray-800 dark:border-gray-600">
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search timezones..."
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded outline-none focus:ring-1 focus:ring-[#db4c3f] dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.slice(0, 100).map((tz) => (
              <button
                key={tz}
                onClick={() => handleSelect(tz)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-white"
              >
                <span className="truncate">{tz}</span>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="text-xs text-gray-400">{localTime(tz)}</span>
                  {value === tz && <Check className="w-4 h-4 text-[#db4c3f]" />}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">No timezones found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
