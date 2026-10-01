import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import * as sectionService from '../../services/sectionService.js';
import { ForbiddenError, NotFoundError } from '../../errors/index.js';
import { dbFixtures } from './fixtures.js';

const fx = dbFixtures('sections');
const U: Record<string, string> = {};
let projectId = '';
let otherProjectId = '';

beforeAll(async () => {
  for (const name of ['owner', 'member', 'guest', 'outsider']) U[name] = (await fx.user(name)).id;
  const ws = await fx.workspace(U.owner, { [U.member]: 'MEMBER', [U.guest]: 'GUEST' });
  projectId = (
    await prisma.project.create({
      data: {
        name: 'Team',
        ownerId: U.owner,
        workspaceId: ws.id,
        members: { create: { userId: U.guest, role: 'COMMENTER' } },
      },
    })
  ).id;
  otherProjectId = (await prisma.project.create({ data: { name: 'Private', ownerId: U.outsider } })).id;
});
afterAll(async () => {
  await fx.cleanup();
  await prisma.$disconnect();
});

describe('sectionService', () => {
  it('workspace members add sections, appended in order', async () => {
    const a = await sectionService.createSection({ name: 'Backlog', projectId }, U.member);
    const b = await sectionService.createSection({ name: 'Doing', projectId }, U.member);
    expect(b.sortOrder).toBeGreaterThan(a.sortOrder);
    expect(a._count.tasks).toBe(0);
  });

  it('guests can read sections but not change them', async () => {
    expect(await sectionService.getProjectSections(projectId, U.guest)).toHaveLength(2);
    await expect(sectionService.createSection({ name: 'Nope', projectId }, U.guest)).rejects.toBeInstanceOf(ForbiddenError);
    const [first] = await sectionService.getProjectSections(projectId, U.guest);
    await expect(sectionService.updateSection(first.id, { name: 'x' }, U.guest)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('outsiders see nothing', async () => {
    await expect(sectionService.getProjectSections(projectId, U.outsider)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('counts only open tasks', async () => {
    const [backlog] = await sectionService.getProjectSections(projectId, U.owner);
    await prisma.task.createMany({
      data: [
        { content: 'open', projectId, sectionId: backlog.id, creatorId: U.owner },
        { content: 'done', projectId, sectionId: backlog.id, creatorId: U.owner, isCompleted: true },
      ],
    });
    const [updated] = await sectionService.getProjectSections(projectId, U.owner);
    expect(updated._count.tasks).toBe(1);
  });

  it('deleting a section keeps its tasks, unsectioned', async () => {
    const [backlog] = await sectionService.getProjectSections(projectId, U.owner);
    await sectionService.deleteSection(backlog.id, U.member);
    const tasks = await prisma.task.findMany({ where: { projectId } });
    expect(tasks).toHaveLength(2);
    expect(tasks.every((t) => t.sectionId === null)).toBe(true);
  });

  it('reorders, refusing sections in a project the user cannot edit', async () => {
    const extra = await sectionService.createSection({ name: 'Review', projectId }, U.owner);
    const sections = await sectionService.getProjectSections(projectId, U.owner);
    const ids = sections.map((s) => s.id).reverse();
    await sectionService.reorderSections(ids, U.member);
    expect((await sectionService.getProjectSections(projectId, U.owner)).map((s) => s.id)).toEqual(ids);

    const foreign = await prisma.section.create({ data: { name: 'Theirs', projectId: otherProjectId } });
    await expect(sectionService.reorderSections([extra.id, foreign.id], U.member)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sectionService.reorderSections(['missing'], U.member)).rejects.toBeInstanceOf(NotFoundError);
  });
});
