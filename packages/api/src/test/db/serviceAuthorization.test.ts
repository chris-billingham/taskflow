import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/database.js';
import { createTask, updateTask } from '../../services/taskService.js';
import { createProject, updateProject } from '../../services/projectService.js';
import { createComment } from '../../services/commentService.js';
import { removeMember } from '../../services/workspaceService.js';
import { getTodayTasks } from '../../services/viewService.js';
import { requireTaskAccess } from '../../services/access.js';
import { ForbiddenError, ValidationError } from '../../errors/index.js';

// Pins the role -> operation mapping at the SERVICE level (the matrix file
// pins the access primitives). Runs against real Postgres.

const RUN = randomUUID().slice(0, 8);
const U: Record<string, string> = {};
let workspaceId = '';
let projectId = '';
let otherProjectId = '';
let taskId = '';

async function mkUser(name: string) {
  const user = await prisma.user.create({
    data: {
      email: `sa-${name}-${RUN}@authz.test`,
      passwordHash: 'x',
      name: `sa-${name}`,
      emailVerified: true,
    },
  });
  U[name] = user.id;
}

beforeAll(async () => {
  for (const n of ['owner', 'admin', 'member', 'guest', 'outsider', 'leaver']) {
    await mkUser(n);
  }

  const ws = await prisma.workspace.create({
    data: {
      name: `Authz WS ${RUN}`,
      slug: `authz-${RUN}`,
      ownerId: U.owner,
      members: {
        create: [
          { userId: U.owner, role: 'OWNER' },
          { userId: U.admin, role: 'ADMIN' },
          { userId: U.member, role: 'MEMBER' },
          { userId: U.guest, role: 'GUEST' },
          { userId: U.leaver, role: 'MEMBER' },
        ],
      },
    },
  });
  workspaceId = ws.id;

  const project = await prisma.project.create({
    data: { name: `Authz P ${RUN}`, ownerId: U.owner, workspaceId: ws.id },
  });
  projectId = project.id;

  // A second project OUTSIDE the workspace, owned by the outsider.
  const other = await prisma.project.create({
    data: { name: `Authz Other ${RUN}`, ownerId: U.outsider },
  });
  otherProjectId = other.id;

  const task = await prisma.task.create({
    data: { content: `authz task ${RUN}`, projectId, creatorId: U.owner },
  });
  taskId = task.id;
});

afterAll(async () => {
  await prisma.workspace.deleteMany({ where: { slug: `authz-${RUN}` } });
  await prisma.project.deleteMany({ where: { id: otherProjectId } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `-${RUN}@authz.test` } } });
  await prisma.$disconnect();
});

describe('role enforcement on mutations', () => {
  it('GUEST cannot create tasks; MEMBER can', async () => {
    await expect(
      createTask({ content: 'nope', projectId }, U.guest),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      createTask({ content: 'member task', projectId }, U.member),
    ).resolves.toBeTruthy();
  });

  it('GUEST can comment (their whole purpose)', async () => {
    await expect(
      createComment(taskId, { content: 'guest comment' }, U.guest),
    ).resolves.toBeTruthy();
  });

  it('GUEST cannot create projects in the workspace; MEMBER can', async () => {
    await expect(
      createProject({ name: 'guest project', workspaceId }, U.guest),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      createProject({ name: `member project ${RUN}`, workspaceId }, U.member),
    ).resolves.toBeTruthy();
  });

  it('project settings need ADMIN: MEMBER rejected, workspace ADMIN allowed', async () => {
    await expect(
      updateProject(projectId, { name: 'renamed by member' }, U.member),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      updateProject(projectId, { name: `Authz P ${RUN}` }, U.admin),
    ).resolves.toBeTruthy();
  });
});

describe('reference validation', () => {
  it('rejects a section from another project', async () => {
    const foreignSection = await prisma.section.create({
      data: { name: 'foreign', projectId: otherProjectId },
    });
    await expect(
      createTask({ content: 'x', projectId, sectionId: foreignSection.id }, U.member),
    ).rejects.toThrow(ValidationError);
    await expect(
      updateTask(taskId, { sectionId: foreignSection.id }, U.member),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects a parent task from another project (the cross-tenant graft)', async () => {
    const victimTask = await prisma.task.create({
      data: { content: 'victim', projectId: otherProjectId, creatorId: U.outsider },
    });
    await expect(
      createTask({ content: 'graft', projectId, parentId: victimTask.id }, U.member),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects parent cycles', async () => {
    const a = await createTask({ content: 'cycle-a', projectId }, U.member);
    const b = await createTask({ content: 'cycle-b', projectId, parentId: a.id }, U.member);
    await expect(
      updateTask(a.id, { parentId: b.id }, U.member),
    ).rejects.toThrow(ValidationError);
    await expect(
      updateTask(a.id, { parentId: a.id }, U.member),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects assigning someone without project access', async () => {
    await expect(
      createTask({ content: 'x', projectId, assigneeId: U.outsider }, U.member),
    ).rejects.toThrow(ValidationError);
    await expect(
      updateTask(taskId, { assigneeId: U.guest }, U.member),
    ).resolves.toBeTruthy();
  });
});

describe('membership revocation lifecycle', () => {
  it('reassigns the leaver-owned projects and revokes all access', async () => {
    const leaverProject = await createProject(
      { name: `leaver project ${RUN}`, workspaceId },
      U.leaver,
    );
    const leaverTask = await createTask(
      { content: 'leaver task', projectId: leaverProject.id },
      U.leaver,
    );

    await removeMember(workspaceId, U.leaver, U.owner);

    // Project ownership moved to the workspace owner...
    const reassigned = await prisma.project.findUniqueOrThrow({
      where: { id: leaverProject.id },
      select: { ownerId: true },
    });
    expect(reassigned.ownerId).toBe(U.owner);

    // ...and the leaver has no residual access, even to tasks they created.
    await expect(
      requireTaskAccess(leaverTask.id, U.leaver, 'VIEW'),
    ).rejects.toThrow(ForbiddenError);
    const remaining = await prisma.projectMember.findMany({
      where: { userId: U.leaver, project: { workspaceId } },
    });
    expect(remaining).toHaveLength(0);
  });
});

describe('workspace policy', () => {
  it('GUESTs cannot read member email addresses', async () => {
    const { getWorkspaceMembers } = await import('../../services/workspaceService.js');
    const asGuest = await getWorkspaceMembers(workspaceId, U.guest);
    expect(asGuest.length).toBeGreaterThan(0);
    for (const m of asGuest) expect(m.user.email).toBeNull();

    const asMember = await getWorkspaceMembers(workspaceId, U.member);
    expect(asMember.some((m) => typeof m.user.email === 'string')).toBe(true);
  });

  it('only the OWNER can demote or remove an ADMIN', async () => {
    const { updateMemberRole, removeMember: rm } = await import(
      '../../services/workspaceService.js'
    );
    // Promote a second admin as owner first.
    await updateMemberRole(workspaceId, U.member, { role: 'ADMIN' }, U.owner);

    await expect(
      updateMemberRole(workspaceId, U.member, { role: 'MEMBER' }, U.admin),
    ).rejects.toThrow(ForbiddenError);
    await expect(rm(workspaceId, U.member, U.admin)).rejects.toThrow(ForbiddenError);

    // The owner can.
    await expect(
      updateMemberRole(workspaceId, U.member, { role: 'MEMBER' }, U.owner),
    ).resolves.toBeTruthy();
  });
});

describe('view scoping', () => {
  it('Today includes workspace tasks for members (they used to vanish)', async () => {
    const due = await createTask(
      { content: `due-today ${RUN}`, projectId, dueDate: new Date().toISOString().slice(0, 10) },
      U.member,
    );
    const view = await getTodayTasks(U.member);
    const all = [
      ...view.overdue,
      ...view.morning,
      ...view.afternoon,
      ...view.evening,
      ...view.noTime,
    ];
    expect(all.map((t) => t.id)).toContain(due.id);
  });
});
