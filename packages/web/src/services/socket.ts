import { io, Socket } from 'socket.io-client';
import { useSocketStore } from '@/stores/socketStore';
import { getAccessToken, refreshAccessToken } from '@/services/api';

// Default to the same origin the app is served from — in production nginx/Traefik
// proxy `/socket.io` to the API. An explicit VITE_WS_URL/VITE_API_URL still wins
// for split-origin deployments. (Previously fell back to http://localhost:3001,
// which broke realtime for every non-local user in the shipped build.)
const WS_URL =
  import.meta.env.VITE_WS_URL ??
  import.meta.env.VITE_API_URL?.replace('/api/v1', '') ??
  (typeof window !== 'undefined' ? window.location.origin : '/');

let socket: Socket | null = null;

// Rooms the app wants to be in, keyed by projectId. Survives disconnects: the
// 'connect' handler re-emits every entry, so reconnects (which create a brand
// new server-side socket with no rooms) recover their subscriptions.
const subscriptions = new Map<string, string | undefined>();

// Handshake auth-failure recovery guard: consecutive failed attempts before we
// stop trying (reset on every successful connect).
let authRetries = 0;
const MAX_AUTH_RETRIES = 3;

// Messages the server middleware rejects the handshake with (websocket/server.ts).
const AUTH_ERRORS = new Set(['Authentication required', 'Invalid or expired token']);

function emitSubscribe(projectId: string, workspaceId?: string): void {
  socket?.emit(
    'subscribe:project',
    { projectId, workspaceId },
    (res?: { ok: boolean }) => {
      if (res && !res.ok) {
        // Denied (no access / project gone) — stop re-subscribing on reconnect.
        // If it was transient, the next view mount re-registers it anyway.
        subscriptions.delete(projectId);
      }
    },
  );
}

export function initSocket(token: string): Socket {
  if (socket) {
    if (socket.connected) return socket;
    socket.disconnect();
  }

  socket = io(WS_URL, {
    // Function form is re-evaluated on every (re)connect, so a refreshed access
    // token is used instead of the stale one captured at first connect.
    auth: (cb) => cb({ token: getAccessToken() ?? token }),
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,
  });

  const { setStatus } = useSocketStore.getState();
  setStatus('connecting');

  socket.on('connect', () => {
    authRetries = 0;
    setStatus('connected');
    // The server auto-joins all currently accessible rooms at connection time;
    // re-subscribing registered rooms here covers projects that became
    // accessible after this socket first connected (e.g. newly shared).
    for (const [projectId, workspaceId] of subscriptions) {
      emitSubscribe(projectId, workspaceId);
    }
  });

  socket.on('disconnect', () => setStatus('disconnected'));

  socket.on('connect_error', (err) => {
    setStatus('disconnected');
    // A rejected handshake (expired/invalid token) is terminal for socket.io —
    // it stops retrying on its own. Refresh the token through the shared HTTP
    // mutex and reconnect manually, bounded so a dead session can't loop.
    if (AUTH_ERRORS.has(err.message) && authRetries < MAX_AUTH_RETRIES) {
      authRetries += 1;
      void refreshAccessToken().then((refreshed) => {
        if (refreshed && socket) {
          setStatus('connecting');
          socket.connect();
        }
      });
    }
  });

  socket.io.on('reconnect_attempt', () => setStatus('connecting'));

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  subscriptions.clear();
  authRetries = 0;
  if (socket) {
    socket.disconnect();
    socket = null;
    useSocketStore.getState().setStatus('disconnected');
  }
}

export function subscribeToProject(projectId: string, workspaceId?: string): void {
  subscriptions.set(projectId, workspaceId);
  // If not connected yet, the 'connect' handler emits it once we are.
  if (socket?.connected) {
    emitSubscribe(projectId, workspaceId);
  }
}

export function unsubscribeFromProject(projectId: string): void {
  subscriptions.delete(projectId);
  socket?.emit('unsubscribe:project', { projectId });
}

export function emitTypingStart(taskId: string, projectId: string): void {
  socket?.emit('typing:start', { taskId, projectId });
}

export function emitTypingStop(taskId: string, projectId: string): void {
  socket?.emit('typing:stop', { taskId, projectId });
}

export function emitPresenceUpdate(data: {
  workspaceId: string;
  taskId?: string;
  projectId?: string;
}): void {
  socket?.emit('presence:update', data);
}
