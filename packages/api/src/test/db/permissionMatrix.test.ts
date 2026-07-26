import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/database.js';
import {
  requireProjectAccess,
  requireTaskAccess,
  requireWorkspaceRole,
  hasProjectAccess,
  taskAccessWhere,
  projectAccessWhere,
} from '../../services/access.js';
import { ForbiddenError } from '../../errors/index.js';

// The authorization contract, exercised against a REAL database. Every role
// tier is pinned for reads and writes so any future access-layer change that
// widens or narrows permissions fails loudly here.

const RUN = randomUUID().slice(0, 8);

type Fixture = {
  users: Record<string, string>; // name -> id
  workspaceId: string;
  projectId: string;
  taskId: string;
  assignedTaskId: string;
};

const F: Fixture = {
  users: {},
  workspaceId: '',
  projectId: '',
  taskId: '',
  assignedTaskId: '',
};

async function createUser(name: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `pm-${name}-${RUN}@matrix.test`,
      passwordHash: 'x',
      name: `pm-${name}`,
      emailVerified: true,
    },
  });
  F.users[name] = user.id;
  return user.id;
}

beforeAll(async () => {
  for (const name of [
    'owner',
    'wsAdmin',
    'wsMember',
    'wsGuest',
    'projViewer',
    'projCommenter',
    'projEditor',
    'projAdmin',
    'assignee',
    'outsider',
    'leaver',
  ]) {
    await createUser(name);
  }

  const ws = await prisma.workspace.create({
    data: {
      name: `Matrix WS ${RUN}`,
      slug: `matrix-${RUN}`,
      ownerId: F.users.owner,
      members: {
        create: [
          { userId: F.users.owner, role: 'OWNER' },
          { userId: F.users.wsAdmin, role: 'ADMIN' },
          { userId: F.users.wsMember, role: 'MEMBER' },
          { userId: F.users.wsGuest, role: 'GUEST' },
          { userId: F.users.leaver, role: 'MEMBER' },
        ],
      },
    },
  });
  F.workspaceId = ws.id;

  const project = await prisma.project.create({
    data: {
      name: `Matrix Project ${RUN}`,
      ownerId: F.users.owner,
      workspaceId: ws.id,
      members: {
        create: [
          { userId: F.users.projViewer, role: 'VIEWER' },
          { userId: F.users.projCommenter, role: 'COMMENTER' },
          { userId: F.users.projEditor, role: 'MEMBER' },
          { userId: F.users.projAdmin, role: 'ADMIN' },
        ],
      },
    },
  });
  F.projectId = project.id;

  const task = await prisma.task.create({
    data: {
      content: `matrix task ${RUN}`,
      projectId: project.id,
      creatorId: F.users.owner,
    },
  });
  F.taskId = task.id;

  const assigned = await prisma.task.create({
    data: {
      content: `matrix assigned task ${RUN}`,
      projectId: project.id,
      creatorId: F.users.owner,
      assigneeId: F.users.assignee,
    },
  });
  F.assignedTaskId = assigned.id;
});

afterAll(async () => {
  await prisma.workspace.deleteMany({ where: { slug: `matrix-${RUN}` } });
  await prisma.user.deleteMany({
    where: { email: { endsWith: `-${RUN}@matrix.test` } },
  });
  await prisma.$disconnect();
});

// name -> [VIEW ok, COMMENT ok, EDIT ok, ADMIN ok]
const PROJECT_MATRIX: Array<[string, boolean, boolean, boolean, boolean]> = [
  ['owner', true, true, true, true],
  ['wsAdmin', true, true, true, true],
  ['wsMember', true, true, true, false],
  ['wsGuest', true, true, false, false],
  ['projViewer', true, false, false, false],
  ['projCommenter', true, true, false, false],
  ['projEditor', true, true, true, false],
  ['projAdmin', true, true, true, true],
  ['outsider', false, false, false, false],
];

describe('project access matrix', () => {
  for (const [name, view, comment, edit, admin] of PROJECT_MATRIX) {
    it(`${name}: VIEW=${view} COMMENT=${comment} EDIT=${edit} ADMIN=${admin}`, async () => {
      const userId = F.users[name];
      const checks = [
        ['VIEW', view],
        ['COMMENT', comment],
        ['EDIT', edit],
        ['ADMIN', admin],
      ] as const;
      for (const [level, allowed] of checks) {
        const attempt = requireProjectAccess(F.projectId, userId, level);
        if (allowed) {
          await expect(attempt, `${name} should hold ${level}`).resolves.toBeTruthy();
        } else {
          await expect(attempt, `${name} must NOT hold ${level}`).rejects.toThrow(
            ForbiddenError,
          );
        }
      }
    });
  }

  it('task access follows the project matrix', async () => {
    await expect(
      requireTaskAccess(F.taskId, F.users.wsGuest, 'COMMENT'),
    ).resolves.toBeTruthy();
    await expect(
      requireTaskAccess(F.taskId, F.users.wsGuest, 'EDIT'),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      requireTaskAccess(F.taskId, F.users.projViewer, 'VIEW'),
    ).resolves.toBeTruthy();
    await expect(
      requireTaskAccess(F.taskId, F.users.outsider, 'VIEW'),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe('assignee grant', () => {
  it('the assignee can work their task without any membership', async () => {
    await expect(
      requireTaskAccess(F.assignedTaskId, F.users.assignee, 'EDIT'),
    ).resolves.toBeTruthy();
  });

  it('assignment does not leak the rest of the project', async () => {
    await expect(
      requireTaskAccess(F.taskId, F.users.assignee, 'VIEW'),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      requireProjectAccess(F.projectId, F.users.assignee, 'VIEW'),
    ).rejects.toThrow(ForbiddenError);
  });

  it('assignment does not grant project-admin powers', async () => {
    await expect(
      requireTaskAccess(F.assignedTaskId, F.users.assignee, 'ADMIN'),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe('no creator backdoor', () => {
  it('creating a task grants nothing once membership is gone', async () => {
    const created = await prisma.task.create({
      data: {
        content: `leaver task ${RUN}`,
        projectId: F.projectId,
        creatorId: F.users.leaver,
      },
    });

    // While a member: full EDIT.
    await expect(
      requireTaskAccess(created.id, F.users.leaver, 'EDIT'),
    ).resolves.toBeTruthy();

    // Membership removed: no residual access via creatorId.
    await prisma.workspaceMember.delete({
      where: {
        workspaceId_userId: { workspaceId: F.workspaceId, userId: F.users.leaver },
      },
    });
    await expect(
      requireTaskAccess(created.id, F.users.leaver, 'VIEW'),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe('query fragments', () => {
  it('taskAccessWhere returns workspace tasks for members and nothing for outsiders', async () => {
    const memberTasks = await prisma.task.findMany({
      where: { AND: [taskAccessWhere(F.users.wsMember), { projectId: F.projectId }] },
      select: { id: true },
    });
    expect(memberTasks.map((t) => t.id)).toContain(F.taskId);

    const outsiderTasks = await prisma.task.findMany({
      where: { AND: [taskAccessWhere(F.users.outsider), { projectId: F.projectId }] },
      select: { id: true },
    });
    expect(outsiderTasks).toHaveLength(0);
  });

  it('taskAccessWhere includes tasks assigned to an otherwise-unrelated user', async () => {
    const tasks = await prisma.task.findMany({
      where: { AND: [taskAccessWhere(F.users.assignee), { projectId: F.projectId }] },
      select: { id: true },
    });
    expect(tasks.map((t) => t.id)).toEqual([F.assignedTaskId]);
  });

  it('projectAccessWhere spans owned, direct-member and workspace projects', async () => {
    for (const name of ['owner', 'wsGuest', 'projViewer']) {
      const projects = await prisma.project.findMany({
        where: { AND: [projectAccessWhere(F.users[name]), { id: F.projectId }] },
        select: { id: true },
      });
      expect(projects, `${name} should list the project`).toHaveLength(1);
    }
    const none = await prisma.project.findMany({
      where: { AND: [projectAccessWhere(F.users.outsider), { id: F.projectId }] },
    });
    expect(none).toHaveLength(0);
  });
});

describe('workspace roles', () => {
  it('enforces the OWNER > ADMIN > MEMBER > GUEST ladder', async () => {
    await expect(
      requireWorkspaceRole(F.workspaceId, F.users.wsAdmin, 'ADMIN'),
    ).resolves.toBeTruthy();
    await expect(
      requireWorkspaceRole(F.workspaceId, F.users.wsAdmin, 'OWNER'),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      requireWorkspaceRole(F.workspaceId, F.users.wsMember, 'ADMIN'),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      requireWorkspaceRole(F.workspaceId, F.users.wsGuest, 'MEMBER'),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      requireWorkspaceRole(F.workspaceId, F.users.outsider, 'GUEST'),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe('non-throwing check', () => {
  it('hasProjectAccess mirrors requireProjectAccess', async () => {
    expect(await hasProjectAccess(F.projectId, F.users.wsGuest, 'VIEW')).toBe(true);
    expect(await hasProjectAccess(F.projectId, F.users.wsGuest, 'EDIT')).toBe(false);
    expect(await hasProjectAccess(F.projectId, F.users.outsider, 'VIEW')).toBe(false);
    expect(await hasProjectAccess('nonexistent-project', F.users.owner)).toBe(false);
  });
});
