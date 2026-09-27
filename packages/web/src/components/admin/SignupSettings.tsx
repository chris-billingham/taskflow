import { useEffect, useState } from 'react';
import * as adminApi from '@/services/admin';
import type { RegistrationMode } from '@/services/admin';
import { toastError } from '@/stores/toastStore';

const OPTIONS: { value: RegistrationMode; label: string; detail: string }[] = [
  {
    value: 'invite',
    label: 'Invite only',
    detail:
      'People join when you add them here or invite them to a workspace. Admin addresses in ADMIN_EMAILS can always sign up.',
  },
  {
    value: 'open',
    label: 'Anyone can sign up',
    detail: 'Anyone who can reach this site can create an account.',
  },
];

/** The instance's sign-up policy, switchable by an admin. */
export function SignupSettings() {
  const [mode, setMode] = useState<RegistrationMode | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .fetchSettings()
      .then((s) => !cancelled && setMode(s.registrationMode))
      .catch(() => !cancelled && toastError('Could not load sign-up settings'));
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = async (next: RegistrationMode) => {
    if (next === mode || saving) return;
    const previous = mode;
    setMode(next);
    setSaving(true);
    try {
      const saved = await adminApi.updateSettings({ registrationMode: next });
      setMode(saved.registrationMode);
    } catch (err) {
      setMode(previous);
      toastError(adminApi.adminErrorMessage(err, 'Could not change sign-up settings'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="signup-settings-heading"
      className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <h3
        id="signup-settings-heading"
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        Sign-ups
      </h3>
      <fieldset className="mt-3 grid gap-2 sm:grid-cols-2" disabled={mode === null || saving}>
        <legend className="sr-only">Who can create an account</legend>
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${
              mode === option.value
                ? 'border-[#db4c3f] bg-[#db4c3f]/5'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <input
              type="radio"
              name="registration-mode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => choose(option.value)}
              className="mt-0.5 accent-[#db4c3f]"
            />
            <span>
              <span className="block font-medium text-gray-900 dark:text-white">
                {option.label}
              </span>
              <span className="mt-0.5 block text-gray-500 dark:text-gray-400">
                {option.detail}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
