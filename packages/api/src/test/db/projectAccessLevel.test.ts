import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import * as projectService from '../../services/projectService.js';
import { dbFixtures } from './fixtures.js';

// Project responses say what the caller may do, so apps can leave out the
// controls a viewer or commenter can't use.
const fx = dbFixtures('projaccess');
let owner: { id: string };
let member: { id: string };
let viewer: { id: string };
let commenter: { id: string };
let projectId = '';

beforeAll(async () => {
  owner = await fx.user('owner');
  member = await fx.user('member');
  viewer = await fx.user('viewer');
  commenter = await fx.user('commenter');
  const workspaceId = (
    await fx.workspace(owner.id, { [member.id]: 'MEMBER', [viewer.id]: 'GUEST', [commenter.id]: 'GUEST' })
  ).id;
  projectId = (await prisma.project.create({ data: { name: 'Plans', ownerId: owner.id, workspaceId } })).id;
  await prisma.projectMember.createMany({
    data: [
      { projectId, userId: viewer.id, role: 'VIEWER' },
      { projectId, userId: commenter.id, role: 'COMMENTER' },
    ],
  });
});
afterAll(async () => {
  await fx.cleanup();
  await prisma.$disconnect();
});

const listed = async (userId: string) =>
  (await projectService.getUserProjects(userId)).find((p) => p.id === projectId)?.access;

describe('access on project responses', () => {
  it.each([
    ['owner', () => owner, 'ADMIN'],
    ['workspace member', () => member, 'EDIT'],
    ['viewer', () => viewer, 'VIEW'],
    ['commenter', () => commenter, 'COMMENT'],
  ] as const)('gives the %s their level in the list and the detail', async (_who, user, level) => {
    expect(await listed(user().id)).toBe(level);
    expect((await projectService.getProjectById(projectId, user().id)).access).toBe(level);
  });
});
