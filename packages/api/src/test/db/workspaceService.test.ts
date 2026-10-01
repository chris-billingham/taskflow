import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import * as workspaceService from '../../services/workspaceService.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors/index.js';
import { dbFixtures } from './fixtures.js';

const fx = dbFixtures('workspaces');
const U: Record<string, string> = {};
const email: Record<string, string> = {};
let wsId = '';

beforeAll(async () => {
  for (const name of ['owner', 'admin', 'member', 'guest', 'invitee', 'outsider']) {
    const user = await fx.user(name);
    U[name] = user.id;
    email[name] = user.email;
  }
  const ws = await workspaceService.createWorkspace({ name: 'Team' }, U.owner);
  wsId = ws.id;
  await prisma.workspaceMember.createMany({
    data: [
      { workspaceId: wsId, userId: U.admin, role: 'ADMIN' },
      { workspaceId: wsId, userId: U.member, role: 'MEMBER' },
      { workspaceId: wsId, userId: U.guest, role: 'GUEST' },
    ],
  });
});
afterAll(async () => {
  await prisma.workspace.deleteMany({ where: { id: wsId } });
  await fx.cleanup();
  await prisma.$disconnect();
});

describe('workspaceService', () => {
  it('the creator is the owner', async () => {
    const [ws] = await workspaceService.getUserWorkspaces(U.owner);
    expect(ws).toMatchObject({ id: wsId, role: 'OWNER' });
  });

  it('guests see members without email addresses', async () => {
    const asGuest = await workspaceService.getWorkspaceMembers(wsId, U.guest);
    expect(asGuest.every((m) => m.user.email === null)).toBe(true);
    const asMember = await workspaceService.getWorkspaceMembers(wsId, U.member);
    expect(asMember.some((m) => m.user.email === email.owner)).toBe(true);
    await expect(workspaceService.getWorkspaceMembers(wsId, U.outsider)).rejects.toBeInstanceOf(ForbiddenError);
  });

  describe('invites', () => {
    it('admins invite members; only the owner can invite an admin', async () => {
      await expect(
        workspaceService.inviteMember(wsId, { email: 'someone@elsewhere.test', role: 'ADMIN' }, U.admin),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        workspaceService.inviteMember(wsId, { email: 'someone@elsewhere.test', role: 'MEMBER' }, U.member),
      ).rejects.toBeInstanceOf(ForbiddenError);
      const invite = await workspaceService.inviteMember(wsId, { email: email.invitee, role: 'MEMBER' }, U.admin);
      expect(invite.token).toHaveLength(64);
    });

    it('refuses a second invite to the same address, and inviting an existing member', async () => {
      await expect(
        workspaceService.inviteMember(wsId, { email: email.invitee, role: 'GUEST' }, U.owner),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(
        workspaceService.inviteMember(wsId, { email: email.member, role: 'GUEST' }, U.owner),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('tells an invitee with an account in the app', async () => {
      await expect.poll(() =>
        prisma.notification.count({ where: { userId: U.invitee, type: 'WORKSPACE_INVITE' } }),
      ).toBe(1);
    });

    it('accepting joins with the invited role and uses up the invite', async () => {
      const [invite] = await workspaceService.getPendingInvites(wsId, U.owner);
      const joined = await workspaceService.acceptInvite(invite.token, U.invitee);
      expect(joined.workspace).toMatchObject({ id: wsId, role: 'MEMBER' });
      await expect(workspaceService.acceptInvite(invite.token, U.invitee)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('an expired invite is refused and removed', async () => {
      const invite = await prisma.workspaceInvite.create({
        data: { workspaceId: wsId, email: 'late@elsewhere.test', token: `late-${fx.run}`, expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(workspaceService.acceptInvite(invite.token, U.outsider)).rejects.toBeInstanceOf(ForbiddenError);
      expect(await prisma.workspaceInvite.findUnique({ where: { id: invite.id } })).toBeNull();
    });
  });

  describe('roles', () => {
    it('admins manage members and guests, but only the owner touches admins', async () => {
      await expect(workspaceService.updateMemberRole(wsId, U.guest, { role: 'MEMBER' }, U.admin)).resolves.toMatchObject({ role: 'MEMBER' });
      await expect(workspaceService.updateMemberRole(wsId, U.guest, { role: 'ADMIN' }, U.admin)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(workspaceService.updateMemberRole(wsId, U.owner, { role: 'MEMBER' }, U.admin)).rejects.toBeInstanceOf(ForbiddenError);
      await workspaceService.updateMemberRole(wsId, U.guest, { role: 'GUEST' }, U.owner);
    });

    it('leaving hands the leaver’s team projects to the owner', async () => {
      const project = await prisma.project.create({ data: { name: 'Member project', ownerId: U.invitee, workspaceId: wsId } });
      await workspaceService.leaveWorkspace(wsId, U.invitee);
      expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).ownerId).toBe(U.owner);
      await expect(workspaceService.getWorkspaceById(wsId, U.invitee)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('the owner cannot leave or be removed', async () => {
      await expect(workspaceService.leaveWorkspace(wsId, U.owner)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(workspaceService.removeMember(wsId, U.owner, U.admin)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('transferring to yourself is refused (it would leave no owner)', async () => {
      await expect(workspaceService.transferOwnership(wsId, U.owner, U.owner)).rejects.toBeInstanceOf(ValidationError);
    });

    it('a guest cannot be made owner', async () => {
      const visitor = await fx.user('visitor');
      await prisma.workspaceMember.create({ data: { workspaceId: wsId, userId: visitor.id, role: 'GUEST' } });
      await expect(workspaceService.transferOwnership(wsId, visitor.id, U.owner)).rejects.toBeInstanceOf(ValidationError);
    });

    it('transferring ownership swaps owner and admin', async () => {
      await workspaceService.transferOwnership(wsId, U.member, U.owner);
      const roles = Object.fromEntries(
        (await prisma.workspaceMember.findMany({ where: { workspaceId: wsId } })).map((m) => [m.userId, m.role]),
      );
      expect(roles[U.member]).toBe('OWNER');
      expect(roles[U.owner]).toBe('ADMIN');
      expect((await prisma.workspace.findUniqueOrThrow({ where: { id: wsId } })).ownerId).toBe(U.member);
    });
  });
});
