import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import * as sharing from '../../services/projectSharing.js';
import { getProjectMembers, getUserProjects } from '../../services/projectService.js';
import { hasProjectAccess } from '../../services/access.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors/index.js';
import { dbFixtures } from './fixtures.js';
import { shareProjectSchema } from '@taskflow/contract';

const fx = dbFixtures('sharing');
const U: Record<string, string> = {};
const E: Record<string, string> = {};
let garden = '';
let inbox = '';
let teamProject = '';

beforeAll(async () => {
  for (const name of ['owner', 'friend', 'viewer', 'teammate', 'guest']) {
    const user = await fx.user(name);
    U[name] = user.id;
    E[name] = user.email;
  }
  garden = (await prisma.project.create({ data: { name: 'Garden', ownerId: U.owner } })).id;
  inbox = (await prisma.project.create({ data: { name: 'Inbox', ownerId: U.owner, isInbox: true } })).id;
  const ws = await fx.workspace(U.owner, { [U.teammate]: 'MEMBER', [U.guest]: 'GUEST' });
  teamProject = (await prisma.project.create({ data: { name: 'Launch', ownerId: U.owner, workspaceId: ws.id } })).id;
});
afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: [garden, inbox] } } });
  await fx.cleanup();
  await prisma.$disconnect();
});

describe('sharing a project', () => {
  it('shares a personal project by email, and tells them', async () => {
    // Through the request schema, as the route does: addresses are case-insensitive.
    const input = shareProjectSchema.parse({ email: E.friend.toUpperCase() });
    expect(input.role).toBe('MEMBER');
    const added = await sharing.shareProject(garden, input, U.owner);
    expect(added).toMatchObject({ role: 'MEMBER', user: { id: U.friend } });

    expect(await hasProjectAccess(garden, U.friend, 'EDIT')).toBe(true);
    expect((await getUserProjects(U.friend)).map((p) => p.id)).toContain(garden);
    const note = await prisma.notification.findFirst({ where: { userId: U.friend, type: 'PROJECT_SHARED' } });
    expect(note?.data).toMatchObject({ projectId: garden });
    expect(await prisma.activityLog.count({ where: { entityId: garden, action: 'SHARED' } })).toBe(1);
  });

  it('refuses unknown people, the owner, repeats and the Inbox', async () => {
    await expect(sharing.shareProject(garden, { email: 'nobody@nowhere.test', role: 'MEMBER' }, U.owner)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(sharing.shareProject(garden, { email: E.owner, role: 'MEMBER' }, U.owner)).rejects.toBeInstanceOf(ConflictError);
    await expect(sharing.shareProject(garden, { email: E.friend, role: 'VIEWER' }, U.owner)).rejects.toBeInstanceOf(ConflictError);
    await expect(sharing.shareProject(inbox, { email: E.friend, role: 'MEMBER' }, U.owner)).rejects.toBeInstanceOf(ValidationError);
  });

  it('only project admins manage the list', async () => {
    await expect(sharing.shareProject(garden, { email: E.viewer, role: 'VIEWER' }, U.friend)).rejects.toBeInstanceOf(ForbiddenError);
    await sharing.shareProject(garden, { email: E.viewer, role: 'VIEWER' }, U.owner);
    await expect(sharing.updateCollaborator(garden, U.viewer, 'ADMIN', U.friend)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sharing.removeCollaborator(garden, U.viewer, U.friend)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('shows the list to everyone on it, hiding addresses from viewers', async () => {
    const asOwner = await sharing.getProjectSharing(garden, U.owner);
    expect(asOwner.canManage).toBe(true);
    expect(asOwner.collaborators.map((c) => c.user.email)).toEqual([E.friend, E.viewer]);

    const asViewer = await sharing.getProjectSharing(garden, U.viewer);
    expect(asViewer.canManage).toBe(false);
    expect(asViewer.owner?.email).toBeNull();
    expect(asViewer.collaborators.every((c) => c.user.email === null)).toBe(true);
  });

  it('changes a role', async () => {
    await sharing.updateCollaborator(garden, U.viewer, 'COMMENTER', U.owner);
    expect(await hasProjectAccess(garden, U.viewer, 'COMMENT')).toBe(true);
    expect(await hasProjectAccess(garden, U.viewer, 'EDIT')).toBe(false);
  });

  it('removing someone takes away their access and their assignments there', async () => {
    const task = await prisma.task.create({ data: { content: 'Prune roses', projectId: garden, assigneeId: U.friend } });
    await sharing.removeCollaborator(garden, U.friend, U.owner);
    expect(await hasProjectAccess(garden, U.friend)).toBe(false);
    expect((await prisma.task.findUnique({ where: { id: task.id } }))?.assigneeId).toBeNull();
  });

  it('anyone on the list can leave', async () => {
    await sharing.removeCollaborator(garden, U.viewer, U.viewer);
    expect(await hasProjectAccess(garden, U.viewer)).toBe(false);
  });
});

describe('workspace guests', () => {
  it('see a team project only once it is shared with them', async () => {
    expect(await hasProjectAccess(teamProject, U.guest)).toBe(false);
    expect((await getProjectMembers(teamProject, U.teammate)).map((m) => m.id).sort()).toEqual([U.owner, U.teammate].sort());

    await sharing.shareProject(teamProject, { email: E.guest, role: 'COMMENTER' }, U.owner);
    expect(await hasProjectAccess(teamProject, U.guest, 'COMMENT')).toBe(true);
    const members = await getProjectMembers(teamProject, U.guest);
    expect(members.map((m) => m.id)).toContain(U.guest);
    // Commenters get names, not addresses.
    expect(members.every((m) => m.email === null)).toBe(true);
  });
});
