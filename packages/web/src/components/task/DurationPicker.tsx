import { useState, useRef, useEffect } from 'react';
import { Clock, X } from 'lucide-react';

interface DurationPickerProps {
  value: number | null;
  onChange: (duration: number | null) => void;
}

const presets = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 hour', value: 60 },
  { label: '1.5 hours', value: 90 },
  { label: '2 hours', value: 120 },
  { label: '3 hours', value: 180 },
  { label: '4 hours', value: 240 },
];

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function DurationPicker({ value, onChange }: DurationPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customH, setCustomH] = useState('');
  const [customM, setCustomM] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const customHRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setCustomMode(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (customMode && customHRef.current) {
      customHRef.current.focus();
    }
  }, [customMode]);

  const handleCustomSubmit = () => {
    const h = parseInt(customH, 10) || 0;
    const m = parseInt(customM, 10) || 0;
    const total = h * 60 + m;
    if (total > 0) {
      onChange(total);
    }
    setIsOpen(false);
    setCustomMode(false);
    setCustomH('');
    setCustomM('');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex items-center gap-1.5 px-2 py-1 text-sm rounded hover:bg-gray-100 text-gray-700"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <Clock className="w-3.5 h-3.5 text-gray-400" />
        {value ? formatDuration(value) : <span className="text-gray-400">None</span>}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
          {/* Presets */}
          {presets.map((p) => (
            <button
              key={p.value}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 ${
                value === p.value ? 'bg-gray-50 font-medium' : 'text-gray-700'
              }`}
              onClick={() => {
                onChange(p.value);
                setIsOpen(false);
                setCustomMode(false);
              }}
            >
              {p.label}
            </button>
          ))}

          <hr className="my-1 border-gray-100" />

          {/* Custom input */}
          {customMode ? (
            <div className="px-3 py-1.5">
              <div className="flex items-center gap-1">
                <input
                  ref={customHRef}
                  className="w-12 text-sm border border-gray-200 rounded px-1.5 py-1 text-center focus:outline-none focus:border-[#db4c3f]"
                  type="number"
                  min="0"
                  max="23"
                  placeholder="0"
                  value={customH}
                  onChange={(e) => setCustomH(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCustomSubmit();
                    if (e.key === 'Escape') {
                      setCustomMode(false);
                      setCustomH('');
                      setCustomM('');
                    }
                  }}
                />
                <span className="text-xs text-gray-500">h</span>
                <input
                  className="w-12 text-sm border border-gray-200 rounded px-1.5 py-1 text-center focus:outline-none focus:border-[#db4c3f]"
                  type="number"
                  min="0"
                  max="59"
                  placeholder="0"
                  value={customM}
                  onChange={(e) => setCustomM(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCustomSubmit();
                    if (e.key === 'Escape') {
                      setCustomMode(false);
                      setCustomH('');
                      setCustomM('');
                    }
                  }}
                />
                <span className="text-xs text-gray-500">m</span>
                <button
                  className="ml-1 px-2 py-1 text-xs font-medium text-white bg-[#db4c3f] rounded hover:bg-[#c53727]"
                  onClick={handleCustomSubmit}
                >
                  Set
                </button>
              </div>
            </div>
          ) : (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setCustomMode(true)}
            >
              Custom...
            </button>
          )}

          {/* Clear */}
          {value !== null && (
            <>
              <hr className="my-1 border-gray-100" />
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                onClick={() => {
                  onChange(null);
                  setIsOpen(false);
                  setCustomMode(false);
                }}
              >
                <X className="w-3.5 h-3.5" />
                Remove duration
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
