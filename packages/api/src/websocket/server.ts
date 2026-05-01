import { Server } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { verifyAccessToken } from '../utils/jwt.js';
import { initSocketIO } from './events.js';
import { registerHandlers } from './handlers.js';

export function createWebSocketServer(httpServer: HTTPServer): Server {
  const io = initSocketIO(httpServer);

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    const payload = verifyAccessToken(token);
    if (!payload) {
      return next(new Error('Invalid or expired token'));
    }
    socket.data.user = payload;
    next();
  });

  io.on('connection', (socket) => {
    registerHandlers(socket as Parameters<typeof registerHandlers>[0]);
  });

  return io;
}
