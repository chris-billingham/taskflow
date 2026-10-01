import type { Socket } from 'socket.io';
import type { TokenPayload } from '../utils/jwt.js';
import { prisma } from '../config/database.js';
import {
  hasProjectAccess,
  hasWorkspaceAccess,
  projectAccessWhere,
  requireTaskAccess,
} from '../services/access.js';
import { WS_EVENTS, getIO } from './events.js';

type AuthSocket = Socket & { data: { user: TokenPayload } };

// Every project/workspace room the user may currently receive broadcasts for.
// Room subscription is a read grant: a client in `project:<id>` receives every
// task/comment/presence broadcast for that project.
async function accessibleRooms(userId: string): Promise<string[]> {
  const [memberships, projects] = await Promise.all([
    // Workspace rooms carry every project's updates; guests only see the
    // projects shared with them, so they get those project rooms instead.
    prisma.workspaceMember.findMany({
      where: { userId, role: { not: 'GUEST' } },
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

const isScopedRoom = (room: string) => room.startsWith('project:') || room.startsWith('workspace:');
const taskRoom = (taskId: string) => `task:${taskId}`;

async function canSeeTask(taskId: string, userId: string) {
  try {
    await requireTaskAccess(taskId, userId, 'VIEW');
    return true;
  } catch {
    return false;
  }
}

/**
 * Tell everyone with a task open who else has it open. Worked out from the
 * sockets in the task's room, so it holds across API instances (Redis
 * adapter) and needs no presence state of its own.
 */
async function broadcastViewers(taskId: string) {
  const io = getIO();
  if (!io) return;
  const sockets = await io.in(taskRoom(taskId)).fetchSockets();
  const users = new Map<string, { id: string; name: string }>();
  for (const s of sockets) {
    const u = s.data.user as TokenPayload | undefined;
    if (u) users.set(u.id, { id: u.id, name: u.name });
  }
  io.to(taskRoom(taskId)).emit(WS_EVENTS.TASK_VIEWERS, { taskId, users: [...users.values()] });
}

/**
 * Bring a user's open sockets in line with what they may read now: join rooms
 * they've just been given (a project shared with them) and leave ones they've
 * lost. Call after any change to someone's project or workspace access.
 */
export async function refreshUserRooms(userId: string): Promise<void> {
  const io = getIO();
  if (!io) return;
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  if (sockets.length === 0) return;
  const allowed = new Set(await accessibleRooms(userId));
  for (const socket of sockets) {
    const stale = [...socket.rooms].filter((room) => isScopedRoom(room) && !allowed.has(room));
    for (const room of stale) socket.leave(room);
    socket.join([...allowed]);
    // Open tasks they can no longer see: stop showing them as a viewer.
    for (const room of [...socket.rooms].filter((r) => r.startsWith('task:'))) {
      const taskId = room.slice('task:'.length);
      if (!(await canSeeTask(taskId, userId))) {
        socket.leave(room);
        void broadcastViewers(taskId);
      }
    }
  }
}

export function registerHandlers(socket: AuthSocket): void {
  const { user } = socket.data;

  socket.join(`user:${user.id}`);
  // So signing this device out can drop its socket too.
  if (user.sid) socket.join(`session:${user.sid}`);

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
          (await hasWorkspaceAccess(data.workspaceId, user.id, { includeGuests: false }))
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

  // Who has a task open: the task panel joins its room while it's showing.
  socket.on(WS_EVENTS.TASK_VIEW, (data: { taskId: string }) => {
    if (!data?.taskId || typeof data.taskId !== 'string') return;
    void (async () => {
      if (!(await canSeeTask(data.taskId, user.id))) return;
      await socket.join(taskRoom(data.taskId));
      await broadcastViewers(data.taskId);
    })().catch(() => {
      /* ignore */
    });
  });

  socket.on(WS_EVENTS.TASK_LEAVE, (data: { taskId: string }) => {
    if (!data?.taskId || typeof data.taskId !== 'string') return;
    void Promise.resolve(socket.leave(taskRoom(data.taskId)))
      .then(() => broadcastViewers(data.taskId))
      .catch(() => {
        /* ignore */
      });
  });

  // Typing goes only to the others with the same task open.
  socket.on(WS_EVENTS.TYPING_START, (data: { taskId: string }) => {
    if (typeof data?.taskId !== 'string' || !socket.rooms.has(taskRoom(data.taskId))) return;
    socket.to(taskRoom(data.taskId)).emit(WS_EVENTS.TYPING_START, {
      userId: user.id,
      userName: user.name,
      taskId: data.taskId,
    });
  });

  socket.on(WS_EVENTS.TYPING_STOP, (data: { taskId: string }) => {
    if (typeof data?.taskId !== 'string' || !socket.rooms.has(taskRoom(data.taskId))) return;
    socket.to(taskRoom(data.taskId)).emit(WS_EVENTS.TYPING_STOP, {
      userId: user.id,
      taskId: data.taskId,
    });
  });

  // A closed tab or lost connection leaves its open tasks.
  socket.on('disconnecting', () => {
    const openTasks = [...socket.rooms].filter((r) => r.startsWith('task:')).map((r) => r.slice('task:'.length));
    socket.once('disconnect', () => {
      for (const taskId of openTasks) void broadcastViewers(taskId);
    });
  });
}
