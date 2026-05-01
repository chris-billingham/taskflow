import { io, Socket } from 'socket.io-client';
import { useSocketStore } from '@/stores/socketStore';

const WS_URL =
  import.meta.env.VITE_WS_URL ??
  (import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3001');

let socket: Socket | null = null;

export function initSocket(token: string): Socket {
  if (socket) {
    if (socket.connected) return socket;
    socket.disconnect();
  }

  socket = io(WS_URL, {
    auth: { token },
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
