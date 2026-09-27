import { request, type APIRequestContext } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL || 'http://localhost:3001';

/**
 * An API client for setup and assertions. Against the production stack
 * (E2E_API_URL=https://localhost in CI) Traefik serves its self-signed default
 * certificate, so certificate errors are ignored; plain http is unaffected.
 */
export function newApiContext(
  options: { extraHTTPHeaders?: Record<string, string> } = {},
): Promise<APIRequestContext> {
  return request.newContext({ baseURL: API_URL, ignoreHTTPSErrors: true, ...options });
}
