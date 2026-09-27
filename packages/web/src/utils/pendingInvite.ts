// Holds a workspace-invite token across the sign-in (or sign-up) detour.
// Putting it in the login redirect URL instead would send it to the server
// logs as a query string.
const PENDING_INVITE_KEY = 'taskflow.pendingInvite';

export function readPendingInvite(): string | null {
  try {
    return sessionStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

export function setPendingInvite(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(PENDING_INVITE_KEY, token);
    else sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // Storage blocked: the user can open the invite link again after signing in.
  }
}
