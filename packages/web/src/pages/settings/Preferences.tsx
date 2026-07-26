import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { ThemeToggle } from '@/components/settings/ThemeToggle';
import api from '@/services/api';

type Theme = 'light' | 'dark' | 'system';

/** Same resolution useTheme() applies, for the pre-save preview. */
function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'dark') {
    root.classList.add('dark');
  } else if (t === 'light') {
    root.classList.remove('dark');
  } else {
    root.classList.toggle(
      'dark',
      window.matchMedia('(prefers-color-scheme: dark)').matches,
    );
  }
}

function OptionGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              value === opt.value
                ? 'border-[#db4c3f] bg-red-50 text-[#db4c3f] dark:bg-red-900/20'
                : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Preferences() {
  const { user, updateUser } = useAuthStore();

  const [theme, setTheme] = useState<Theme>((user?.theme as Theme) ?? 'system');
  const [weekStart, setWeekStart] = useState<number>(user?.weekStart ?? 0);
  const [dateFormat, setDateFormat] = useState<string>(user?.dateFormat ?? 'MMM d, yyyy');
  const [timeFormat, setTimeFormat] = useState<string>(user?.timeFormat ?? '12h');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  // Read by the unmount cleanup, which must not re-run when this flips.
  const savedRef = useRef(false);

  // Preview the theme as soon as it's clicked, before saving — picking a theme
  // you can't see applied is a poor trade for one round-trip.
  const handleThemeChange = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
  };

  // ...but a preview that was never saved must not outlive this page. Leaving
  // without pressing Save previously left the previewed theme applied until the
  // next full reload, so the app disagreed with the stored preference.
  const savedTheme = (user?.theme as Theme) ?? 'system';
  useEffect(() => {
    return () => {
      if (!savedRef.current) applyTheme(savedTheme);
    };
  }, [savedTheme]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.patch('/settings/preferences', {
        theme,
        weekStart,
        dateFormat,
        timeFormat,
      });
      updateUser(data.data);
      savedRef.current = true;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Preferences</h2>

      {/* Theme */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Appearance</h3>
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Theme</p>
          <ThemeToggle value={theme} onChange={handleThemeChange} />
        </div>
      </section>

      {/* Date & Time */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Date & Time</h3>

        <OptionGroup
          label="Week starts on"
          options={[
            { value: 0, label: 'Sunday' },
            { value: 1, label: 'Monday' },
            { value: 6, label: 'Saturday' },
          ]}
          value={weekStart}
          onChange={setWeekStart}
        />

        <OptionGroup
          label="Date format"
          options={[
            { value: 'MMM d, yyyy', label: 'Jan 5, 2025' },
            { value: 'MM/dd/yyyy', label: '01/05/2025' },
            { value: 'dd/MM/yyyy', label: '05/01/2025' },
            { value: 'yyyy-MM-dd', label: '2025-01-05' },
          ]}
          value={dateFormat}
          onChange={setDateFormat}
        />

        <OptionGroup
          label="Time format"
          options={[
            { value: '12h', label: '12-hour (2:30 PM)' },
            { value: '24h', label: '24-hour (14:30)' },
          ]}
          value={timeFormat}
          onChange={setTimeFormat}
        />
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-5 py-2 bg-[#db4c3f] text-white rounded-lg text-sm font-medium hover:bg-[#c53727] disabled:opacity-60 transition-colors"
      >
        {saved ? 'Saved!' : saving ? 'Saving…' : 'Save preferences'}
      </button>
    </div>
  );
}
