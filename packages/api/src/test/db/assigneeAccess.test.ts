import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import { requireTaskAccess, taskAccessWhere } from '../../services/access.js';
import * as workspaceService from '../../services/workspaceService.js';
import { dbFixtures } from './fixtures.js';

// Being assigned a task lets someone work it while they can see its project,
// and stops when they can't: leaving or being removed from the workspace, or
// becoming a guest, must not leave a back door through their assignments.
const fx = dbFixtures('assignee');
let owner: { id: string };
let sam: { id: string };
let workspaceId = '';
let taskId = '';

beforeAll(async () => {
  owner = await fx.user('owner');
  sam = await fx.user('sam');
  workspaceId = (await fx.workspace(owner.id, { [sam.id]: 'MEMBER' })).id;
  const project = await prisma.project.create({ data: { name: 'Team', ownerId: owner.id, workspaceId } });
  taskId = (await prisma.task.create({ data: { content: 'Sam’s job', projectId: project.id, creatorId: owner.id, assigneeId: sam.id } })).id;
});
afterAll(async () => {
  await fx.cleanup();
  await prisma.$disconnect();
});

const canSee = async (userId: string) => (await prisma.task.count({ where: { id: taskId, ...taskAccessWhere(userId) } })) === 1;

describe('access through assignment', () => {
  it('lets a member work their assigned task', async () => {
    await expect(requireTaskAccess(taskId, sam.id, 'EDIT')).resolves.toBeTruthy();
    expect(await canSee(sam.id)).toBe(true);
  });

  it('ends when they become a guest who wasn’t shared the project', async () => {
    await workspaceService.updateMemberRole(workspaceId, sam.id, { role: 'GUEST' }, owner.id);
    await expect(requireTaskAccess(taskId, sam.id, 'VIEW')).rejects.toThrow();
    expect(await canSee(sam.id)).toBe(false);
    await workspaceService.updateMemberRole(workspaceId, sam.id, { role: 'MEMBER' }, owner.id);
  });

  it('lets a viewer of the project still edit the task assigned to them', async () => {
    await workspaceService.updateMemberRole(workspaceId, sam.id, { role: 'GUEST' }, owner.id);
    const project = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { projectId: true } });
    await prisma.projectMember.create({ data: { projectId: project.projectId, userId: sam.id, role: 'VIEWER' } });
    await expect(requireTaskAccess(taskId, sam.id, 'EDIT')).resolves.toBeTruthy();
    await prisma.projectMember.deleteMany({ where: { projectId: project.projectId, userId: sam.id } });
    await workspaceService.updateMemberRole(workspaceId, sam.id, { role: 'MEMBER' }, owner.id);
  });

  it('ends when they’re removed from the workspace', async () => {
    await workspaceService.removeMember(workspaceId, sam.id, owner.id);
    await expect(requireTaskAccess(taskId, sam.id, 'VIEW')).rejects.toThrow();
    expect(await canSee(sam.id)).toBe(false);
  });
});
