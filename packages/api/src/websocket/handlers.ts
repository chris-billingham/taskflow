import type { Socket } from 'socket.io';
import type { TokenPayload } from '../utils/jwt.js';
import { updatePresence, removePresence } from './presence.js';
import { WS_EVENTS } from './events.js';

type AuthSocket = Socket & { data: { user: TokenPayload } };

export function registerHandlers(socket: AuthSocket): void {
  const { user } = socket.data;

  socket.join(`user:${user.id}`);

  socket.on(WS_EVENTS.SUBSCRIBE_PROJECT, (data: { projectId: string; workspaceId?: string }) => {
    socket.join(`project:${data.projectId}`);
    if (data.workspaceId) {
      socket.join(`workspace:${data.workspaceId}`);
    }
  });

  socket.on(WS_EVENTS.UNSUBSCRIBE_PROJECT, (data: { projectId: string }) => {
    socket.leave(`project:${data.projectId}`);
  });

  socket.on(
    WS_EVENTS.PRESENCE_UPDATE,
    (data: { workspaceId: string; taskId?: string; projectId?: string }) => {
      if (!data.workspaceId) return;
      updatePresence(socket.id, data.workspaceId, {
        userId: user.id,
        userName: user.name,
        taskId: data.taskId,
        projectId: data.projectId,
      });
    },
  );

  socket.on(WS_EVENTS.TYPING_START, (data: { taskId: string; projectId: string }) => {
    socket.to(`project:${data.projectId}`).emit(WS_EVENTS.TYPING_START, {
      userId: user.id,
      userName: user.name,
      taskId: data.taskId,
    });
  });

  socket.on(WS_EVENTS.TYPING_STOP, (data: { taskId: string; projectId: string }) => {
    socket.to(`project:${data.projectId}`).emit(WS_EVENTS.TYPING_STOP, {
      userId: user.id,
      taskId: data.taskId,
    });
  });

  socket.on('disconnect', () => {
    removePresence(socket.id);
  });
}
