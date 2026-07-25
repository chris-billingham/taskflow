import axios, { InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Required so the browser sends the httpOnly refresh token cookie
  // on cross-origin requests (dev: localhost:5173 → localhost:3001)
  withCredentials: true,
});

// Request interceptor: attach access token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Shared token refresh ──────────────────────────────────────────────────────
// One in-flight refresh at a time; concurrent callers (the 401 interceptor,
// the websocket's auth-failure recovery) all await the same promise so the
// single-use refresh cookie is never sent twice in parallel (the server treats
// a second use of the same token as theft and revokes every session).
let refreshPromise: Promise<string | null> | null = null;

function hardLogout(): void {
  setAccessToken(null);
  // Clear persisted user state so the app redirects to login
  localStorage.removeItem('auth-storage');
  window.location.href = '/login';
}

/**
 * Refresh the access token from the httpOnly cookie. Returns the new token,
 * or null on failure. Only a definitive rejection (401/403 — the session is
 * gone) forces a logout; transient network failures leave the session alone
 * so a flaky connection doesn't log the user out.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      // Use a bare axios call to avoid interceptor loops.
      const { data } = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true },
      );
      const newAccessToken = data.data.accessToken as string;
      setAccessToken(newAccessToken);
      return newAccessToken;
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 401 || status === 403) {
        hardLogout();
      }
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    const isRefreshRequest = originalRequest.url?.includes('/auth/refresh');
    // Don't attempt token refresh for auth endpoints — a 401 there means bad
    // credentials, not an expired session.
    const isAuthEndpoint =
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/register');

    if (error.response?.status === 401 && !originalRequest._retry && !isRefreshRequest && !isAuthEndpoint) {
      originalRequest._retry = true;
      const token = await refreshAccessToken();
      if (token) {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      }
    }

    return Promise.reject(error);
  },
);

export default api;
