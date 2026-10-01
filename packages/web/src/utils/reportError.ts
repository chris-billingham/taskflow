import { toastError } from '@/stores/toastStore';

/**
 * Surface a failed mutation to the user and mark the error as reported so the
 * global unhandledrejection listener doesn't double-toast it. Stores call
 * this in their catch blocks (before rethrowing for callers that care) —
 * previously a rejected mutation silently rolled back and the user believed
 * their change was saved.
 */
export function reportMutationError(err: unknown, fallback: string): void {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  const message = offline
    ? "You're offline, so that couldn't be saved. Try again when you're back online."
    : ((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback);
  toastError(message);
  if (err && typeof err === 'object') {
    (err as { __toastShown?: boolean }).__toastShown = true;
  }
}

/** True when reportMutationError already surfaced this error. */
export function wasReported(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { __toastShown?: boolean }).__toastShown);
}
