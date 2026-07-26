import { Server } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { verifyAccessToken, type TokenPayload } from '../utils/jwt.js';
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

    // A socket is authenticated ONCE, at handshake. Without an expiry cutoff
    // a stolen 15-minute access token buys an indefinite realtime feed. Force
    // a disconnect when the presented token expires; the client reconnects
    // with a fresh one (its auth callback re-reads the current token).
    const { exp } = socket.data.user as TokenPayload & { exp?: number };
    if (exp) {
      const remainingMs = exp * 1000 - Date.now();
      const timer = setTimeout(() => {
        socket.disconnect(true);
      }, Math.max(remainingMs, 0));
      socket.on('disconnect', () => clearTimeout(timer));
    }
  });

  return io;
}
