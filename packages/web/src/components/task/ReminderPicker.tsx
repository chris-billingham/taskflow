import { useState, useEffect, useRef } from 'react';
import { Bell, Plus, X, Clock } from 'lucide-react';
import api from '@/services/api';
import { formatUserDateTime } from '@/utils/dateFormat';

interface Reminder {
  id: string;
  type: 'ABSOLUTE' | 'RELATIVE';
  triggerAt: string | null;
  minutesBefore: number | null;
  method: 'PUSH' | 'EMAIL';
  isSent: boolean;
}

interface ReminderPickerProps {
  taskId: string;
}

const presets = [
  { label: '30 minutes before', minutesBefore: 30 },
  { label: '1 hour before', minutesBefore: 60 },
  { label: '1 day before', minutesBefore: 1440 },
];

function formatReminder(reminder: Reminder): string {
  if (reminder.type === 'RELATIVE' && reminder.minutesBefore) {
    if (reminder.minutesBefore < 60) return `${reminder.minutesBefore} min before`;
    if (reminder.minutesBefore < 1440) return `${reminder.minutesBefore / 60}h before`;
    return `${reminder.minutesBefore / 1440}d before`;
  }
  if (reminder.triggerAt) {
    return formatUserDateTime(new Date(reminder.triggerAt));
  }
  return 'Reminder';
}

export function ReminderPicker({ taskId }: ReminderPickerProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customDateTime, setCustomDateTime] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchReminders();
  }, [taskId]);

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

  const fetchReminders = async () => {
    try {
      const { data } = await api.get(`/tasks/${taskId}/reminders`);
      setReminders(data.data);
    } catch {
      // Silently fail - reminders are optional
    }
  };

  const addPreset = async (minutesBefore: number) => {
    try {
      await api.post(`/tasks/${taskId}/reminders`, {
        type: 'RELATIVE',
        minutesBefore,
      });
      await fetchReminders();
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to add reminder:', err);
    }
  };

  const addCustom = async () => {
    if (!customDateTime) return;
    try {
      await api.post(`/tasks/${taskId}/reminders`, {
        type: 'ABSOLUTE',
        triggerAt: new Date(customDateTime).toISOString(),
      });
      await fetchReminders();
      setShowCustom(false);
      setIsOpen(false);
      setCustomDateTime('');
    } catch (err) {
      console.error('Failed to add custom reminder:', err);
    }
  };

  const removeReminder = async (id: string) => {
    try {
      await api.delete(`/reminders/${id}`);
      setReminders((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to remove reminder:', err);
    }
  };

  return (
    <div className="relative" ref={ref}>
      {/* Existing reminders */}
      {reminders.length > 0 && (
        <div className="space-y-1 mb-1">
          {reminders.map((reminder) => (
            <div
              key={reminder.id}
              className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 group"
            >
              <Bell className="w-3 h-3" />
              <span className={reminder.isSent ? 'line-through text-gray-400 dark:text-gray-500' : ''}>
                {formatReminder(reminder)}
              </span>
              <button
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => removeReminder(reminder.id)}
              >
                <X className="w-3 h-3 text-gray-400 dark:text-gray-500" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add reminder button */}
      <button
        className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-amber-600 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <Plus className="w-3.5 h-3.5" />
        Add reminder
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1">
          {/* Presets */}
          {presets.map((preset) => (
            <button
              key={preset.minutesBefore}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              onClick={() => addPreset(preset.minutesBefore)}
            >
              <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              {preset.label}
            </button>
          ))}

          <hr className="my-1 border-gray-100 dark:border-gray-700" />

          {/* Custom time */}
          {showCustom ? (
            <div className="px-3 py-2 space-y-2">
              <input
                type="datetime-local"
                className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded px-2 py-1"
                value={customDateTime}
                onChange={(e) => setCustomDateTime(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  className="flex-1 px-2 py-1 text-xs bg-[#db4c3f] text-white rounded hover:bg-[#c53727]"
                  onClick={addCustom}
                >
                  Add
                </button>
                <button
                  className="flex-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  onClick={() => setShowCustom(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              onClick={() => setShowCustom(true)}
            >
              <Bell className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              Custom time...
            </button>
          )}
        </div>
      )}
    </div>
  );
}
