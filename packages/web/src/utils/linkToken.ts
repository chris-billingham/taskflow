/**
 * One-time tokens from emailed links (verify email, reset password, workspace
 * invite).
 *
 * Links carry the token in the URL fragment (`#token=…`) because browsers never
 * send the fragment to a server, so it can't end up in Traefik, nginx or API
 * access logs. Links sent before that change used the query string, which is
 * still accepted.
 */
export function readLinkToken(location: { hash: string; search: string }): string | null {
  const fromFragment = new URLSearchParams(location.hash.replace(/^#/, '')).get('token');
  return fromFragment || new URLSearchParams(location.search).get('token');
}

/**
 * Remove the token from the address bar once it has been read, so it isn't
 * left in browser history, bookmarks or a screenshot.
 */
export function clearLinkToken(): void {
  window.history.replaceState(window.history.state, '', window.location.pathname);
}
