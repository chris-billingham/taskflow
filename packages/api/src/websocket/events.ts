import { Server } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { env } from '../config/env.js';

export const WS_EVENTS = {
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  TASK_DELETED: 'task:deleted',
  PROJECT_UPDATED: 'project:updated',
  PROJECT_DELETED: 'project:deleted',
  SECTION_CREATED: 'section:created',
  SECTION_UPDATED: 'section:updated',
  SECTION_DELETED: 'section:deleted',
  COMMENT_CREATED: 'comment:created',
  COMMENT_UPDATED: 'comment:updated',
  COMMENT_DELETED: 'comment:deleted',
  PRESENCE_UPDATED: 'presence:updated',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  SUBSCRIBE_PROJECT: 'subscribe:project',
  UNSUBSCRIBE_PROJECT: 'unsubscribe:project',
  PRESENCE_UPDATE: 'presence:update',
  // Server → client: this socket has joined every room it can currently read,
  // so the client may now reconcile anything broadcast before the join landed.
  // The join is asynchronous, so `connect` alone is too early to be that signal.
  ROOMS_READY: 'rooms:ready',
} as const;

let io: Server | null = null;

export function initSocketIO(httpServer: HTTPServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
    path: '/socket.io',
  });
  return io;
}

export function getIO(): Server | null {
  return io;
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  io?.to(`user:${userId}`).emit(event, data);
}

export function emitToProject(projectId: string, event: string, data: unknown): void {
  io?.to(`project:${projectId}`).emit(event, data);
}

export function emitToWorkspace(workspaceId: string, event: string, data: unknown): void {
  io?.to(`workspace:${workspaceId}`).emit(event, data);
}

/**
 * Kill every live socket a user has. Called on credential rotation (password
 * change/reset) and refresh-token reuse detection: a websocket authenticated
 * with a now-stolen token would otherwise keep streaming the user's data
 * indefinitely — sockets are only re-authenticated at handshake time.
 */
export function disconnectUserSockets(userId: string): void {
  io?.in(`user:${userId}`).disconnectSockets(true);
}
