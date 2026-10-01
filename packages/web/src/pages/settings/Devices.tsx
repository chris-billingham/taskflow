import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Check, Copy, KeyRound, Monitor, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { useApiTokens, useSessionActions, useSessions } from '@/queries/sessions';
import { formatUserDate } from '@/utils/dateFormat';
import type { ApiToken, CreatedApiToken } from '@taskflow/contract';

const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true });

/** Where you're signed in, and personal access tokens for scripts. */
export default function Devices() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Devices &amp; tokens</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Where you're signed in, and access tokens for scripts and integrations.
        </p>
      </div>
      <SessionsSection />
      <TokensSection />
    </div>
  );
}

function SessionsSection() {
  const { sessions, loading, error } = useSessions();
  const { revokeSession, revokeOtherSessions } = useSessionActions();
  const others = sessions.filter((s) => !s.current).length;

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Signed-in devices</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Signing a device out ends its session; it will need your password again.
          </p>
        </div>
        {others > 0 && (
          <Button variant="secondary" size="sm" onClick={() => void revokeOtherSessions()}>
            Sign out of all others
          </Button>
        )}
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {sessions.map((s) => {
            const Icon = s.client === 'APP' ? Smartphone : Monitor;
            return (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <Icon className="w-5 h-5 text-gray-400 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-white truncate">
                    {s.name}
                    {s.current && <span className="ml-2 text-xs text-green-600 dark:text-green-400">This device</span>}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Signed in {formatUserDate(new Date(s.startedAt))} · last active {ago(s.lastUsedAt)}
                  </p>
                </div>
                {!s.current && (
                  <Button variant="secondary" size="sm" onClick={() => void revokeSession(s.id)} aria-label={`Sign out ${s.name}`}>
                    Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TokensSection() {
  const { tokens, loading, error } = useApiTokens();
  const { createToken, revokeToken } = useSessionActions();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'READ' | 'WRITE'>('READ');
  const [expiry, setExpiry] = useState('90');
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<ApiToken | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setFormError('');
    try {
      const token = await createToken({ name: name.trim(), scope, expiresInDays: expiry ? Number(expiry) : undefined });
      setCreated(token);
      setName('');
    } catch (err) {
      setFormError((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'The token could not be created');
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const field =
    'rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-primary-500/40';

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Personal access tokens</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 mb-4">
        For scripts and integrations: send one as <code className="text-xs">Authorization: Bearer tfp_…</code>.
        Read-only tokens can only read. No token can change your password, sessions or tokens, or delete your account.
      </p>

      {created && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" role="status">
          <p className="text-sm font-medium text-green-800 dark:text-green-300">
            Copy “{created.name}” now. You won't be able to see it again.
          </p>
          <div className="flex gap-2 mt-2">
            <input readOnly value={created.token} aria-label="New token" className={`${field} flex-1 font-mono text-xs`} />
            <Button variant="secondary" size="sm" onClick={() => void copy()} aria-label={copied ? 'Copied' : 'Copy token'}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setCreated(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2 mb-4">
        <label className="flex-1 min-w-48 text-xs text-gray-600 dark:text-gray-400">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Calendar sync" className={`${field} w-full mt-1`} />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          Access
          <select value={scope} onChange={(e) => setScope(e.target.value as 'READ' | 'WRITE')} className={`${field} block mt-1`}>
            <option value="READ">Read only</option>
            <option value="WRITE">Read and write</option>
          </select>
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          Expires
          <select value={expiry} onChange={(e) => setExpiry(e.target.value)} className={`${field} block mt-1`}>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="365">In a year</option>
            <option value="">Never</option>
          </select>
        </label>
        <Button type="submit" size="sm" isLoading={creating} disabled={!name.trim()}>
          Create token
        </Button>
      </form>
      {formError && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{formError}</p>}

      {loading ? (
        <Spinner />
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No tokens yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-3">
              <KeyRound className="w-5 h-5 text-gray-400 shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-white truncate">
                  {t.name} <code className="ml-1 text-xs text-gray-500">{t.prefix}…</code>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t.scope === 'READ' ? 'Read only' : 'Read and write'} ·{' '}
                  {t.lastUsedAt ? `last used ${ago(t.lastUsedAt)}` : 'never used'} ·{' '}
                  {t.expiresAt ? `expires ${formatUserDate(new Date(t.expiresAt))}` : 'never expires'}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setRevoking(t)} aria-label={`Revoke ${t.name}`}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={revoking !== null}
        title="Revoke token?"
        message={`Anything using “${revoking?.name ?? ''}” will stop working straight away.`}
        confirmLabel="Revoke"
        onConfirm={() => {
          if (revoking) void revokeToken(revoking.id);
          setRevoking(null);
        }}
        onCancel={() => setRevoking(null)}
      />
    </section>
  );
}
