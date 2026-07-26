import { useState } from 'react';
import { Copy, Check, KeyRound } from 'lucide-react';

/**
 * Shows a generated password exactly once. The server does not store it in
 * plaintext and cannot produce it again, so the copy affordance and the
 * "you will not see this again" warning are load-bearing, not decoration.
 */
export function CredentialReveal({
  password,
  email,
  onDismiss,
}: {
  password: string;
  email: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure origin / permission) — the password is
      // still on screen to be copied by hand.
    }
  };

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Temporary password for {email}
          </h3>
          <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
            Copy it now and share it over a trusted channel. It is not stored and
            cannot be shown again.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <code
              data-testid="temporary-password"
              className="flex-1 overflow-x-auto rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-sm text-gray-900 dark:border-amber-900 dark:bg-gray-900 dark:text-gray-100"
            >
              {password}
            </code>
            <button
              onClick={handleCopy}
              aria-label="Copy password"
              className="flex-shrink-0 rounded-lg border border-amber-300 p-2 hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/40"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4 text-amber-700 dark:text-amber-300" />
              )}
            </button>
          </div>

          <button
            onClick={onDismiss}
            className="mt-3 text-xs font-medium text-amber-900 underline hover:no-underline dark:text-amber-200"
          >
            I have saved it — dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
