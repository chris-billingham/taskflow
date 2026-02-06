import { useState, useRef, useEffect } from 'react';
import { Flag } from 'lucide-react';

interface PriorityPickerProps {
  value: number;
  onChange: (priority: number) => void;
}

const priorities = [
  { value: 1, label: 'Priority 1', color: 'text-red-500', bg: 'bg-red-50' },
  { value: 2, label: 'Priority 2', color: 'text-orange-500', bg: 'bg-orange-50' },
  { value: 3, label: 'Priority 3', color: 'text-blue-500', bg: 'bg-blue-50' },
  { value: 4, label: 'Priority 4', color: 'text-gray-400', bg: 'bg-gray-50' },
];

export function PriorityPicker({ value, onChange }: PriorityPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const current = priorities.find((p) => p.value === value) || priorities[3];

  return (
    <div className="relative" ref={ref}>
      <button
        className={`p-1.5 rounded hover:bg-gray-100 ${current.color}`}
        onClick={() => setIsOpen(!isOpen)}
        title={current.label}
        type="button"
      >
        <Flag className="w-4 h-4" fill={value < 4 ? 'currentColor' : 'none'} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
          {priorities.map((p) => (
            <button
              key={p.value}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 ${
                value === p.value ? p.bg : ''
              }`}
              onClick={() => {
                onChange(p.value);
                setIsOpen(false);
              }}
            >
              <Flag
                className={`w-4 h-4 ${p.color}`}
                fill={p.value < 4 ? 'currentColor' : 'none'}
              />
              <span className="text-gray-700">{p.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
