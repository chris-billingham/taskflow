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

export function registerHandlers(socket: AuthSocket): void {
  const { user } = socket.data;

  socket.join(`user:${user.id}`);

  socket.on(
    WS_EVENTS.SUBSCRIBE_PROJECT,
    (data: { projectId: string; workspaceId?: string }) => {
      void (async () => {
        if (!data?.projectId || typeof data.projectId !== 'string') return;
        if (await canAccessProject(user.id, data.projectId)) {
          socket.join(`project:${data.projectId}`);
        }
        if (data.workspaceId && (await canAccessWorkspace(user.id, data.workspaceId))) {
          socket.join(`workspace:${data.workspaceId}`);
        }
      })().catch(() => {
        /* ignore subscription failures; client simply receives no updates */
      });
    },
  );

  socket.on(WS_EVENTS.UNSUBSCRIBE_PROJECT, (data: { projectId: string }) => {
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
