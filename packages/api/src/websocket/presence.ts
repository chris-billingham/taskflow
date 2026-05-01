import { getIO, WS_EVENTS } from './events.js';

export interface PresenceUser {
  userId: string;
  userName: string;
  taskId?: string;
  projectId?: string;
  lastSeen: number;
}

// workspaceId -> socketId -> PresenceUser
const presenceByWorkspace = new Map<string, Map<string, PresenceUser>>();
// socketId -> workspaceId (for cleanup on disconnect)
const socketToWorkspace = new Map<string, string>();

export function updatePresence(
  socketId: string,
  workspaceId: string,
  entry: Omit<PresenceUser, 'lastSeen'>,
): void {
  if (!presenceByWorkspace.has(workspaceId)) {
    presenceByWorkspace.set(workspaceId, new Map());
  }
  presenceByWorkspace.get(workspaceId)!.set(socketId, { ...entry, lastSeen: Date.now() });
  socketToWorkspace.set(socketId, workspaceId);
  broadcastPresence(workspaceId);
}

export function removePresence(socketId: string): void {
  const workspaceId = socketToWorkspace.get(socketId);
  if (!workspaceId) return;
  presenceByWorkspace.get(workspaceId)?.delete(socketId);
  socketToWorkspace.delete(socketId);
  broadcastPresence(workspaceId);
}

export function getWorkspacePresence(workspaceId: string): PresenceUser[] {
  const entries = presenceByWorkspace.get(workspaceId);
  if (!entries) return [];
  const staleThreshold = Date.now() - 60_000;
  return Array.from(entries.values()).filter((e) => e.lastSeen > staleThreshold);
}

function broadcastPresence(workspaceId: string): void {
  getIO()
    ?.to(`workspace:${workspaceId}`)
    .emit(WS_EVENTS.PRESENCE_UPDATED, {
      workspaceId,
      users: getWorkspacePresence(workspaceId),
    });
}

// Clean up stale entries every 30 seconds
setInterval(() => {
  const staleThreshold = Date.now() - 60_000;
  for (const [workspaceId, entries] of presenceByWorkspace) {
    let changed = false;
    for (const [socketId, entry] of entries) {
      if (entry.lastSeen < staleThreshold) {
        entries.delete(socketId);
        socketToWorkspace.delete(socketId);
        changed = true;
      }
    }
    if (changed) broadcastPresence(workspaceId);
  }
}, 30_000);
