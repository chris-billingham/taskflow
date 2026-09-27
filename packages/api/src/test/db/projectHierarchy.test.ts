import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import * as projectService from '../../services/projectService.js';
import { ForbiddenError, ValidationError } from '../../errors/index.js';
import { dbFixtures } from './fixtures.js';

const fx = dbFixtures('hierarchy');
const U: Record<string, string> = {};
let wsId = '';

beforeAll(async () => {
  for (const name of ['owner', 'guest', 'outsider']) U[name] = (await fx.user(name)).id;
  wsId = (await fx.workspace(U.owner, { [U.guest]: 'GUEST' })).id;
});
afterAll(async () => {
  await fx.cleanup();
  await prisma.$disconnect();
});

const personal = (name: string, extra: Record<string, unknown> = {}) =>
  prisma.project.create({ data: { name, ownerId: U.owner, ...extra } });

describe('project parents and descriptions', () => {
  it('creates a project with a description under a parent', async () => {
    const parent = await personal('Home');
    const child = await projectService.createProject(
      { name: 'Garden', parentId: parent.id, description: 'Beds, shed and lawn' },
      U.owner,
    );
    expect(child.parentId).toBe(parent.id);
    expect(child.description).toBe('Beds, shed and lawn');
  });

  it('moves a project under another, back to the top level, and clears the description', async () => {
    const a = await personal('Work');
    const b = await personal('Clients', { description: 'Old text' });
    expect((await projectService.updateProject(b.id, { parentId: a.id }, U.owner)).parentId).toBe(a.id);
    const top = await projectService.updateProject(b.id, { parentId: null, description: null }, U.owner);
    expect(top.parentId).toBeNull();
    expect(top.description).toBeNull();
  });

  it('refuses loops: a project under itself or its own sub-project', async () => {
    const root = await personal('Root');
    const mid = await personal('Mid', { parentId: root.id });
    const leaf = await personal('Leaf', { parentId: mid.id });
    await expect(projectService.updateProject(root.id, { parentId: root.id }, U.owner)).rejects.toBeInstanceOf(ValidationError);
    await expect(projectService.updateProject(root.id, { parentId: leaf.id }, U.owner)).rejects.toBeInstanceOf(ValidationError);
    expect((await prisma.project.findUnique({ where: { id: root.id } }))?.parentId).toBeNull();
  });

  it('keeps parents in the same space and out of the Inbox', async () => {
    const mine = await personal('Mine');
    const team = await prisma.project.create({ data: { name: 'Team', ownerId: U.owner, workspaceId: wsId } });
    const inbox = await personal('Inbox', { isInbox: true });
    await expect(projectService.updateProject(mine.id, { parentId: team.id }, U.owner)).rejects.toBeInstanceOf(ValidationError);
    await expect(projectService.updateProject(mine.id, { parentId: inbox.id }, U.owner)).rejects.toBeInstanceOf(ValidationError);
    await expect(projectService.updateProject(inbox.id, { parentId: mine.id }, U.owner)).rejects.toBeInstanceOf(ValidationError);
    await expect(
      projectService.createProject({ name: 'Cross', parentId: team.id }, U.owner),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('needs edit access to the new parent', async () => {
    const theirs = await prisma.project.create({ data: { name: 'Theirs', ownerId: U.outsider } });
    const mine = await personal('Mine too');
    await expect(projectService.updateProject(mine.id, { parentId: theirs.id }, U.owner)).rejects.toBeInstanceOf(ForbiddenError);
    const team = await prisma.project.create({ data: { name: 'Team 2', ownerId: U.owner, workspaceId: wsId } });
    await expect(
      projectService.createProject({ name: 'Guest child', parentId: team.id, workspaceId: wsId }, U.guest),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
