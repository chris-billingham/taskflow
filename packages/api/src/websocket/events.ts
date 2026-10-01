import { Server } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { Redis } from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import { Emitter } from '@socket.io/redis-emitter';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export const WS_EVENTS = {
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  TASK_DELETED: 'task:deleted',
  PROJECT_UPDATED: 'project:updated',
  PROJECT_DELETED: 'project:deleted',
  // To one user: a project was shared with them, or they lost it.
  PROJECT_SHARED: 'project:shared',
  PROJECT_UNSHARED: 'project:unshared',
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
  // To one user: a notification arrived, or their notifications changed
  // (read elsewhere), so the bell should re-read.
  NOTIFICATION_CREATED: 'notification:created',
  NOTIFICATIONS_CHANGED: 'notifications:changed',
  // A project's tasks or sections were put in a new order.
  TASKS_REORDERED: 'tasks:reordered',
  SECTIONS_REORDERED: 'sections:reordered',
} as const;

let io: Server | null = null;
// In a process without a Socket.IO server (the worker), events go out through
// Redis to whichever API instance holds the sockets.
let emitter: Emitter | null = null;

function redisClient(name: string) {
  const client = new Redis(env.REDIS_URL, { retryStrategy: (times) => Math.min(times * 200, 5000) });
  client.on('error', (err: Error) => logger.error({ err }, `${name} Redis connection error`));
  return client;
}

export function initSocketIO(httpServer: HTTPServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
    path: '/socket.io',
  });
  // Rooms and broadcasts span every API instance and the worker.
  const pub = redisClient('Socket.IO');
  io.adapter(createAdapter(pub, pub.duplicate()));
  return io;
}

/** For the worker: lets background jobs reach connected browsers. */
export function initSocketEmitter(): void {
  emitter = new Emitter(redisClient('Socket.IO emitter'));
}

export function getIO(): Server | null {
  return io;
}

function to(room: string) {
  return io ? io.to(room) : emitter?.to(room);
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  to(`user:${userId}`)?.emit(event, data);
}

export function emitToProject(projectId: string, event: string, data: unknown): void {
  to(`project:${projectId}`)?.emit(event, data);
}

export function emitToWorkspace(workspaceId: string, event: string, data: unknown): void {
  to(`workspace:${workspaceId}`)?.emit(event, data);
}

/**
 * Kill every live socket a user has. Called on credential rotation (password
 * change/reset) and refresh-token reuse detection: a websocket authenticated
 * with a now-stolen token would otherwise keep streaming the user's data
 * indefinitely — sockets are only re-authenticated at handshake time.
 */
export function disconnectUserSockets(userId: string): void {
  (io ?? emitter)?.in(`user:${userId}`).disconnectSockets(true);
}
