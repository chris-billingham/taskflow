import { useState } from 'react';
import { Check } from 'lucide-react';

interface TaskCheckboxProps {
  checked: boolean;
  priority: number;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

const priorityColors: Record<number, { border: string; bg: string }> = {
  1: { border: 'border-red-500', bg: 'bg-red-500' },
  2: { border: 'border-orange-500', bg: 'bg-orange-500' },
  3: { border: 'border-blue-500', bg: 'bg-blue-500' },
  4: { border: 'border-gray-300', bg: 'bg-gray-400' },
};

export function TaskCheckbox({ checked, priority, disabled, onChange }: TaskCheckboxProps) {
  const [animating, setAnimating] = useState(false);
  const colors = priorityColors[priority] || priorityColors[4];

  const handleClick = () => {
    if (disabled) return;
    if (!checked) {
      setAnimating(true);
      setTimeout(() => setAnimating(false), 400);
    }
    onChange(!checked);
  };

  return (
    <button
      className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
        checked
          ? `${colors.bg} border-transparent`
          : `${colors.border} hover:bg-gray-50`
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${
        animating ? 'scale-110' : ''
      }`}
      onClick={handleClick}
      disabled={disabled}
      type="button"
    >
      {checked && (
        <Check
          className={`w-3 h-3 text-white ${animating ? 'animate-check' : ''}`}
          strokeWidth={3}
        />
      )}
    </button>
  );
}
