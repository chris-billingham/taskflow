import type { Socket } from 'socket.io';
import type { TokenPayload } from '../utils/jwt.js';
import { prisma } from '../config/database.js';
import {
  hasProjectAccess,
  hasWorkspaceAccess,
  projectAccessWhere,
} from '../services/access.js';
import { updatePresence, removePresence } from './presence.js';
import { WS_EVENTS } from './events.js';

type AuthSocket = Socket & { data: { user: TokenPayload } };

// Every project/workspace room the user may currently receive broadcasts for.
// Room subscription is a read grant: a client in `project:<id>` receives every
// task/comment/presence broadcast for that project.
async function accessibleRooms(userId: string): Promise<string[]> {
  const [memberships, projects] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { userId },
      select: { workspaceId: true },
    }),
    prisma.project.findMany({
      where: projectAccessWhere(userId),
      select: { id: true },
    }),
  ]);

  return [
    ...memberships.map((m) => `workspace:${m.workspaceId}`),
    ...projects.map((p) => `project:${p.id}`),
  ];
}

export function registerHandlers(socket: AuthSocket): void {
  const { user } = socket.data;

  socket.join(`user:${user.id}`);

  // Auto-join everything the user can currently see, so realtime works across
  // all views (Today, Upcoming, lists) without the app subscribing per project,
  // and so reconnects recover their rooms with no client round trips. The
  // explicit subscribe below covers projects shared after this socket connected.
  void accessibleRooms(user.id)
    .then((rooms) => {
      if (socket.connected && rooms.length) socket.join(rooms);
    })
    .catch(() => {
      /* client can still subscribe explicitly per project */
    })
    .finally(() => {
      // Announce the join either way. Until this fires the client is connected
      // but deaf, and it has no other way to know: broadcasts in that window
      // reach nobody and are never replayed, so the client needs a moment at
      // which re-reading its views is guaranteed to close the gap. Emitted on
      // the failure path too — a client that never hears this would never
      // reconcile at all.
      if (socket.connected) socket.emit(WS_EVENTS.ROOMS_READY);
    });

  socket.on(
    WS_EVENTS.SUBSCRIBE_PROJECT,
    (
      data: { projectId: string; workspaceId?: string },
      ack?: (res: { ok: boolean }) => void,
    ) => {
      void (async () => {
        if (!data?.projectId || typeof data.projectId !== 'string') {
          ack?.({ ok: false });
          return;
        }
        let ok = false;
        if (await hasProjectAccess(data.projectId, user.id, 'VIEW')) {
          socket.join(`project:${data.projectId}`);
          ok = true;
        }
        if (
          data.workspaceId &&
          typeof data.workspaceId === 'string' &&
          (await hasWorkspaceAccess(data.workspaceId, user.id))
        ) {
          socket.join(`workspace:${data.workspaceId}`);
        }
        // Ack tells the client whether the join was granted, so a denied
        // subscription can be dropped instead of retried on every reconnect.
        ack?.({ ok });
      })().catch(() => ack?.({ ok: false }));
    },
  );

  socket.on(WS_EVENTS.UNSUBSCRIBE_PROJECT, (data: { projectId: string }) => {
    if (!data?.projectId || typeof data.projectId !== 'string') return;
    socket.leave(`project:${data.projectId}`);
  });

  socket.on(
    WS_EVENTS.PRESENCE_UPDATE,
    (data: { workspaceId: string; taskId?: string; projectId?: string }) => {
      if (!data.workspaceId) return;
      void (async () => {
        if (!(await hasWorkspaceAccess(data.workspaceId, user.id))) return;
        updatePresence(socket.id, data.workspaceId, {
          userId: user.id,
          userName: user.name,
          taskId: data.taskId,
          projectId: data.projectId,
        });
      })().catch(() => {
        /* ignore */
      });
    },
  );

  socket.on(WS_EVENTS.TYPING_START, (data: { taskId: string; projectId: string }) => {
    if (!socket.rooms.has(`project:${data.projectId}`)) return;
    socket.to(`project:${data.projectId}`).emit(WS_EVENTS.TYPING_START, {
      userId: user.id,
      userName: user.name,
      taskId: data.taskId,
    });
  });

  socket.on(WS_EVENTS.TYPING_STOP, (data: { taskId: string; projectId: string }) => {
    if (!socket.rooms.has(`project:${data.projectId}`)) return;
    socket.to(`project:${data.projectId}`).emit(WS_EVENTS.TYPING_STOP, {
      userId: user.id,
      taskId: data.taskId,
    });
  });

  socket.on('disconnect', () => {
    removePresence(socket.id);
  });
}
