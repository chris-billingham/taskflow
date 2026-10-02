import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TwoFactorSetup, TwoFactorStatus } from '@taskflow/contract';
import api from '@/services/api';
import { formatUserDate } from '@/utils/dateFormat';

const statusKey = ['two-factor'] as const;

const inputClass =
  'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-primary-500';
const primaryButton =
  'px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-60 transition-colors';
const secondaryButton =
  'px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 transition-colors';

type Mode =
  | { step: 'idle' }
  | { step: 'confirm'; next: 'setup' | 'recovery' }
  | { step: 'scan'; setup: TwoFactorSetup }
  | { step: 'codes'; codes: string[] }
  | { step: 'disable' };

const messageOf = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

/** Recovery codes, shown once: copy or download them before leaving. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join('\n');
  const download = () => {
    const url = URL.createObjectURL(new Blob([`Taskflow recovery codes\n\n${text}\n`], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'taskflow-recovery-codes.txt' });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Save these recovery codes somewhere safe, such as a password manager. Each one signs you in once if you
        don’t have your phone. They won’t be shown again.
      </p>
      <ul
        aria-label="Recovery codes"
        className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-gray-50 p-3 font-mono text-sm text-gray-900 dark:bg-gray-900 dark:text-gray-100"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} onClick={() => void navigator.clipboard?.writeText(text)}>
          Copy
        </button>
        <button type="button" className={secondaryButton} onClick={download}>
          Download
        </button>
        <button type="button" className={primaryButton} onClick={onDone}>
          I’ve saved them
        </button>
      </div>
    </div>
  );
}

/** Settings → Account: two-factor sign-in with an authenticator app. */
export function TwoFactorSettings() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: statusKey,
    queryFn: async () => (await api.get('/auth/two-factor')).data.data as TwoFactorStatus,
  });
  const [mode, setMode] = useState<Mode>({ step: 'idle' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = (next: Mode = { step: 'idle' }) => {
    setMode(next);
    setPassword('');
    setCode('');
    setError('');
  };

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(messageOf(err, fallback));
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: statusKey });
    }
  };

  const confirmPassword = (next: 'setup' | 'recovery') =>
    run(async () => {
      if (next === 'setup') {
        const { data } = await api.post('/auth/two-factor/setup', { password });
        reset({ step: 'scan', setup: data.data });
      } else {
        const { data } = await api.post('/auth/two-factor/recovery-codes', { password });
        reset({ step: 'codes', codes: data.data.recoveryCodes });
      }
    }, 'That didn’t work. Try again.');

  const enable = () =>
    run(async () => {
      const { data } = await api.post('/auth/two-factor/enable', { code });
      reset({ step: 'codes', codes: data.data.recoveryCodes });
    }, 'That code isn’t right.');

  const disable = () =>
    run(async () => {
      const factor = /^\d{6}$/.test(code.trim()) ? { code } : { recoveryCode: code };
      await api.post('/auth/two-factor/disable', { password, ...factor });
      reset();
    }, 'That didn’t work. Try again.');

  const enabled = status.data?.enabled ?? false;

  return (
    <section
      aria-labelledby="two-factor-heading"
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4"
    >
      <div>
        <h3 id="two-factor-heading" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Two-factor sign-in
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {enabled && status.data?.enabledAt
            ? `On since ${formatUserDate(new Date(status.data.enabledAt))}. ${status.data.recoveryCodesLeft} of 10 recovery codes left.`
            : 'Ask for a code from an authenticator app (such as 1Password, Google Authenticator or Authy) as well as your password when you sign in.'}
        </p>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {mode.step === 'idle' && !status.isLoading && (
        <div className="flex flex-wrap gap-2">
          {enabled ? (
            <>
              <button type="button" className={secondaryButton} onClick={() => reset({ step: 'confirm', next: 'recovery' })}>
                New recovery codes
              </button>
              <button type="button" className={secondaryButton} onClick={() => reset({ step: 'disable' })}>
                Turn off
              </button>
            </>
          ) : (
            <button type="button" className={primaryButton} onClick={() => reset({ step: 'confirm', next: 'setup' })}>
              Set up
            </button>
          )}
        </div>
      )}

      {mode.step === 'confirm' && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void confirmPassword(mode.next);
          }}
        >
          <label htmlFor="two-factor-password" className="block text-sm text-gray-700 dark:text-gray-300">
            Enter your password to continue
          </label>
          <input
            id="two-factor-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          <div className="flex gap-2">
            <button type="submit" className={primaryButton} disabled={!password || busy}>
              Continue
            </button>
            <button type="button" className={secondaryButton} onClick={() => reset()}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode.step === 'scan' && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void enable();
          }}
        >
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Scan this with your authenticator app, then enter the 6-digit code it shows.
          </p>
          <img
            src={mode.setup.qrCode}
            alt="QR code for your authenticator app"
            width={176}
            height={176}
            className="rounded-lg bg-white p-2"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Can’t scan it? Enter this key instead:{' '}
            <code className="break-all font-mono text-gray-900 dark:text-gray-100">{mode.setup.secret}</code>
          </p>
          <label htmlFor="two-factor-code" className="block text-sm text-gray-700 dark:text-gray-300">
            Code from the app
          </label>
          <input
            id="two-factor-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${inputClass} max-w-40 font-mono tracking-widest`}
          />
          <div className="flex gap-2">
            <button type="submit" className={primaryButton} disabled={code.trim().length < 6 || busy}>
              Turn on
            </button>
            <button type="button" className={secondaryButton} onClick={() => reset()}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode.step === 'codes' && <RecoveryCodes codes={mode.codes} onDone={() => reset()} />}

      {mode.step === 'disable' && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void disable();
          }}
        >
          <div>
            <label htmlFor="two-factor-off-password" className="block text-sm text-gray-700 dark:text-gray-300">
              Password
            </label>
            <input
              id="two-factor-off-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="two-factor-off-code" className="block text-sm text-gray-700 dark:text-gray-300">
              Code from your app, or a recovery code
            </label>
            <input
              id="two-factor-off-code"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className={primaryButton} disabled={!password || !code.trim() || busy}>
              Turn off two-factor sign-in
            </button>
            <button type="button" className={secondaryButton} onClick={() => reset()}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
