import type { Socket } from 'socket.io';
import type { TokenPayload } from '../utils/jwt.js';
import { prisma } from '../config/database.js';
import { updatePresence, removePresence } from './presence.js';
import { WS_EVENTS } from './events.js';

type AuthSocket = Socket & { data: { user: TokenPayload } };

// Room subscription is a read grant: a client that joins `project:<id>` receives
// every task/comment/presence broadcast for that project. Verify the user may
// actually see the project (owner, direct member, or member of its workspace)
// before joining — otherwise any authenticated user could subscribe to an
// arbitrary project id and passively receive another tenant's data.
async function canAccessProject(userId: string, projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true, workspaceId: true },
  });
  if (!project) return false;
  if (project.ownerId === userId) return true;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { userId: true },
  });
  if (member) return true;

  if (project.workspaceId) {
    return canAccessWorkspace(userId, project.workspaceId);
  }
  return false;
}

async function canAccessWorkspace(userId: string, workspaceId: string): Promise<boolean> {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { userId: true },
  });
  return !!member;
}

// Every project/workspace room the user may currently receive broadcasts for:
// owned projects, direct project memberships, and every project in a workspace
// they belong to.
async function accessibleRooms(userId: string): Promise<string[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((m) => m.workspaceId);

  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } },
        ...(workspaceIds.length ? [{ workspaceId: { in: workspaceIds } }] : []),
      ],
    },
    select: { id: true },
  });

  return [
    ...workspaceIds.map((id) => `workspace:${id}`),
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
        if (await canAccessProject(user.id, data.projectId)) {
          socket.join(`project:${data.projectId}`);
          ok = true;
        }
        if (
          data.workspaceId &&
          typeof data.workspaceId === 'string' &&
          (await canAccessWorkspace(user.id, data.workspaceId))
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
        if (!(await canAccessWorkspace(user.id, data.workspaceId))) return;
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
