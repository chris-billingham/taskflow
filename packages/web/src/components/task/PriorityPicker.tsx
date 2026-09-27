import { Flag } from 'lucide-react';
import { Menu, MenuItem } from '@/components/ui/Menu';

interface PriorityPickerProps {
  value: number;
  onChange: (priority: number) => void;
}

const priorities = [
  { value: 1, label: 'Priority 1', color: 'text-red-500' },
  { value: 2, label: 'Priority 2', color: 'text-orange-500' },
  { value: 3, label: 'Priority 3', color: 'text-blue-500' },
  { value: 4, label: 'Priority 4', color: 'text-gray-400 dark:text-gray-500' },
];

/** The priority flag; opens a menu of the four priorities, the current one checked. */
export function PriorityPicker({ value, onChange }: PriorityPickerProps) {
  const current = priorities.find((p) => p.value === value) || priorities[3];

  return (
    <Menu
      label={`Priority: ${current.label}`}
      align="left"
      triggerVariant="plain"
      triggerClassName={`p-1.5 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${current.color}`}
      menuClassName="w-40"
      trigger={<Flag className="w-4 h-4" fill={value < 4 ? 'currentColor' : 'none'} />}
    >
      {priorities.map((p) => (
        <MenuItem key={p.value} checked={value === p.value} onSelect={() => onChange(p.value)}>
          <Flag className={`w-4 h-4 ${p.color}`} fill={p.value < 4 ? 'currentColor' : 'none'} aria-hidden="true" />
          {p.label}
        </MenuItem>
      ))}
    </Menu>
  );
}
