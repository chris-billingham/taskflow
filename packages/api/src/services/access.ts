import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../errors/index.js';
import type { Prisma, ProjectRole, WorkspaceRole } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// The single source of truth for who may see or change what. Every service
// goes through these helpers — the previous per-service copies drifted apart
// (some ignored workspaces, some granted by creatorId, none checked roles).
//
// Semantics:
// - A project is visible to its owner, its direct members, and every member
//   of its workspace.
// - Levels are ordered VIEW < COMMENT < EDIT < ADMIN. Project roles map
//   directly (VIEWER/COMMENTER/MEMBER/ADMIN); workspace roles grant a
//   baseline on all workspace projects (GUEST→COMMENT, MEMBER→EDIT,
//   ADMIN/OWNER→ADMIN); the project owner is always ADMIN. The highest
//   applicable grant wins.
// - A task's assignee can always at least work the task (EDIT on that task),
//   even if their project role is lower.
// - Creating a task/comment/etc. does NOT grant standing access: creators
//   lost their membership lose their access (their old creatorId backdoor
//   let removed members keep read/write on every task they ever created).
// ─────────────────────────────────────────────────────────────────────────────

export type AccessLevel = 'VIEW' | 'COMMENT' | 'EDIT' | 'ADMIN';

const LEVEL_RANK: Record<AccessLevel, number> = {
  VIEW: 0,
  COMMENT: 1,
  EDIT: 2,
  ADMIN: 3,
};

const PROJECT_ROLE_LEVEL: Record<ProjectRole, AccessLevel> = {
  VIEWER: 'VIEW',
  COMMENTER: 'COMMENT',
  MEMBER: 'EDIT',
  ADMIN: 'ADMIN',
};

const WORKSPACE_ROLE_LEVEL: Record<WorkspaceRole, AccessLevel> = {
  GUEST: 'COMMENT',
  MEMBER: 'EDIT',
  ADMIN: 'ADMIN',
  OWNER: 'ADMIN',
};

const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  GUEST: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

function atLeast(level: AccessLevel | null, required: AccessLevel): boolean {
  return level !== null && LEVEL_RANK[level] >= LEVEL_RANK[required];
}

function maxLevel(a: AccessLevel | null, b: AccessLevel | null): AccessLevel | null {
  if (a === null) return b;
  if (b === null) return a;
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

// ── Query fragments (for list endpoints) ─────────────────────────────────────

/** Prisma where-fragment: projects the user can at least VIEW. */
export function projectAccessWhere(userId: string): Prisma.ProjectWhereInput {
  return {
    OR: [
      { ownerId: userId },
      { members: { some: { userId } } },
      { workspace: { members: { some: { userId } } } },
    ],
  };
}

/** Prisma where-fragment: tasks the user can at least VIEW. */
export function taskAccessWhere(userId: string): Prisma.TaskWhereInput {
  return {
    OR: [{ assigneeId: userId }, { project: projectAccessWhere(userId) }],
  };
}

// ── Point checks ─────────────────────────────────────────────────────────────

type ProjectAccessShape = {
  id: string;
  ownerId: string | null;
  workspaceId: string | null;
};

async function effectiveProjectLevel(
  project: ProjectAccessShape,
  userId: string,
): Promise<AccessLevel | null> {
  if (project.ownerId === userId) return 'ADMIN';

  const [member, wsMember] = await Promise.all([
    prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId } },
      select: { role: true },
    }),
    project.workspaceId
      ? prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: { workspaceId: project.workspaceId, userId },
          },
          select: { role: true },
        })
      : Promise.resolve(null),
  ]);

  return maxLevel(
    member ? PROJECT_ROLE_LEVEL[member.role] : null,
    wsMember ? WORKSPACE_ROLE_LEVEL[wsMember.role] : null,
  );
}

/** Non-throwing point check (used by e.g. websocket room joins). */
export async function hasProjectAccess(
  projectId: string,
  userId: string,
  level: AccessLevel = 'VIEW',
): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true, workspaceId: true },
  });
  if (!project) return false;
  return atLeast(await effectiveProjectLevel(project, userId), level);
}

/**
 * Throwing point check. Returns the project row (id/owner/workspace/isInbox
 * selection) when the user holds at least `level` on it.
 */
export async function requireProjectAccess(
  projectId: string,
  userId: string,
  level: AccessLevel = 'VIEW',
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      workspaceId: true,
      isInbox: true,
      parentId: true,
    },
  });
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  const have = await effectiveProjectLevel(project, userId);
  if (have === null) {
    throw new ForbiddenError('You do not have access to this project');
  }
  if (!atLeast(have, level)) {
    throw new ForbiddenError('You do not have permission to do that in this project');
  }
  return project;
}

/**
 * Throwing point check for a task. Returns the task with its project rows
 * attached. The assignee always holds at least EDIT on their own task.
 */
export async function requireTaskAccess(
  taskId: string,
  userId: string,
  level: AccessLevel = 'VIEW',
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { id: true, ownerId: true, workspaceId: true } },
    },
  });
  if (!task) {
    throw new NotFoundError('Task not found');
  }

  let have = await effectiveProjectLevel(task.project, userId);
  if (task.assigneeId === userId) {
    have = maxLevel(have, 'EDIT');
  }

  if (have === null) {
    throw new ForbiddenError('You do not have access to this task');
  }
  if (!atLeast(have, level)) {
    throw new ForbiddenError('You do not have permission to do that with this task');
  }
  return task;
}

/**
 * Batch variant for bulk operations: the user's effective level on each of
 * the given projects, resolved with two queries total instead of two per
 * project. Projects the user cannot access are absent from the result.
 */
export async function effectiveProjectLevels(
  projects: ProjectAccessShape[],
  userId: string,
): Promise<Map<string, AccessLevel>> {
  const unique = new Map(projects.map((p) => [p.id, p]));
  const projectIds = [...unique.keys()];
  const workspaceIds = [
    ...new Set(
      [...unique.values()]
        .map((p) => p.workspaceId)
        .filter((id): id is string => id !== null),
    ),
  ];

  const [members, wsMembers] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId: { in: projectIds }, userId },
      select: { projectId: true, role: true },
    }),
    workspaceIds.length
      ? prisma.workspaceMember.findMany({
          where: { workspaceId: { in: workspaceIds }, userId },
          select: { workspaceId: true, role: true },
        })
      : Promise.resolve([]),
  ]);

  const roleByProject = new Map(members.map((m) => [m.projectId, m.role]));
  const roleByWorkspace = new Map(wsMembers.map((m) => [m.workspaceId, m.role]));

  const result = new Map<string, AccessLevel>();
  for (const project of unique.values()) {
    let level: AccessLevel | null = project.ownerId === userId ? 'ADMIN' : null;
    const projectRole = roleByProject.get(project.id);
    if (projectRole) level = maxLevel(level, PROJECT_ROLE_LEVEL[projectRole]);
    const wsRole = project.workspaceId
      ? roleByWorkspace.get(project.workspaceId)
      : undefined;
    if (wsRole) level = maxLevel(level, WORKSPACE_ROLE_LEVEL[wsRole]);
    if (level !== null) result.set(project.id, level);
  }
  return result;
}

/** Rank comparison helper for consumers of effectiveProjectLevels. */
export function levelSatisfies(
  level: AccessLevel | undefined,
  required: AccessLevel,
): boolean {
  return level !== undefined && LEVEL_RANK[level] >= LEVEL_RANK[required];
}

/** Throwing workspace-role check (OWNER > ADMIN > MEMBER > GUEST). */
export async function requireWorkspaceRole(
  workspaceId: string,
  userId: string,
  minRole: WorkspaceRole = 'GUEST',
) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) {
    throw new ForbiddenError('You do not have access to this workspace');
  }
  if (WORKSPACE_ROLE_RANK[member.role] < WORKSPACE_ROLE_RANK[minRole]) {
    throw new ForbiddenError('You do not have permission to do that in this workspace');
  }
  return member;
}

/** Non-throwing workspace membership check. */
export async function hasWorkspaceAccess(
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { userId: true },
  });
  return !!member;
}
