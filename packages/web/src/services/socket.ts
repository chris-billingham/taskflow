import { io, Socket } from 'socket.io-client';
import { useSocketStore } from '@/stores/socketStore';
import { getAccessToken } from '@/services/api';

// Default to the same origin the app is served from — in production nginx/Traefik
// proxy `/socket.io` to the API. An explicit VITE_WS_URL/VITE_API_URL still wins
// for split-origin deployments. (Previously fell back to http://localhost:3001,
// which broke realtime for every non-local user in the shipped build.)
const WS_URL =
  import.meta.env.VITE_WS_URL ??
  import.meta.env.VITE_API_URL?.replace('/api/v1', '') ??
  (typeof window !== 'undefined' ? window.location.origin : '/');

let socket: Socket | null = null;

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

  socket.on('connect', () => setStatus('connected'));
  socket.on('disconnect', () => setStatus('disconnected'));
  socket.on('connect_error', () => setStatus('disconnected'));
  socket.io.on('reconnect_attempt', () => setStatus('connecting'));

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    useSocketStore.getState().setStatus('disconnected');
  }
}

export function subscribeToProject(projectId: string, workspaceId?: string): void {
  socket?.emit('subscribe:project', { projectId, workspaceId });
}

export function unsubscribeFromProject(projectId: string): void {
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
