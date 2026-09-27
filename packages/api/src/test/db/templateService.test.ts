import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import * as templateService from '../../services/templateService.js';
import { ForbiddenError } from '../../errors/index.js';
import { dbFixtures } from './fixtures.js';

const fx = dbFixtures('templates');
const U: Record<string, string> = {};
let workspaceId = '';
let teamProjectId = '';

beforeAll(async () => {
  for (const name of ['owner', 'member', 'guest', 'outsider']) U[name] = (await fx.user(name)).id;
  workspaceId = (await fx.workspace(U.owner, { [U.member]: 'MEMBER', [U.guest]: 'GUEST' })).id;

  const label = await prisma.label.create({ data: { name: 'Blocker', userId: U.owner } });
  const project = await prisma.project.create({
    data: { name: 'Launch plan', color: '#123456', ownerId: U.owner, workspaceId },
  });
  teamProjectId = project.id;
  const section = await prisma.section.create({ data: { name: 'Week 1', projectId: project.id, sortOrder: 1 } });
  const parent = await prisma.task.create({
    data: {
      content: 'Brief the team',
      projectId: project.id,
      sectionId: section.id,
      creatorId: U.owner,
      priority: 2,
      taskLabels: { create: [{ labelId: label.id }] },
    },
  });
  await prisma.task.create({
    data: { content: 'Book the room', projectId: project.id, parentId: parent.id, creatorId: U.owner },
  });
});
afterAll(async () => {
  await fx.cleanup();
  await prisma.$disconnect();
});

describe('templateService', () => {
  it('any workspace member can save a team project as a template', async () => {
    const template = await templateService.createTemplate(
      { name: 'Launch', projectId: teamProjectId, workspaceId },
      U.member,
    );
    expect(template.data.sections).toEqual([{ name: 'Week 1', sortOrder: 1 }]);
    expect(template.data.tasks).toMatchObject([
      { content: 'Brief the team', priority: 2, sectionIndex: 0, labels: ['Blocker'], subtasks: [{ content: 'Book the room' }] },
    ]);
    expect(template.isPublic).toBe(false);
  });

  it('outsiders can neither save nor read it', async () => {
    await expect(
      templateService.createTemplate({ name: 'Stolen', projectId: teamProjectId }, U.outsider),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const [template] = await templateService.getWorkspaceTemplates(workspaceId, U.member);
    await expect(templateService.getTemplateById(template.id, U.outsider)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(templateService.getWorkspaceTemplates(workspaceId, U.outsider)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('applies into a new personal project with sections, subtasks and the user’s own labels', async () => {
    const [template] = await templateService.getWorkspaceTemplates(workspaceId, U.guest);
    const project = await templateService.applyTemplate(template.id, { name: 'My launch' }, U.guest);
    expect(project).toMatchObject({ name: 'My launch', color: '#123456', ownerId: U.guest, workspaceId: null });
    expect(project.sections.map((s) => s.name)).toEqual(['Week 1']);

    const tasks = await prisma.task.findMany({
      where: { projectId: project.id },
      include: { taskLabels: { include: { label: true } } },
      orderBy: { createdAt: 'asc' },
    });
    expect(tasks.map((t) => t.content)).toEqual(['Brief the team', 'Book the room']);
    expect(tasks[1].parentId).toBe(tasks[0].id);
    // Labels are personal: the applier gets their own "Blocker", not the owner's.
    expect(tasks[0].taskLabels.map((tl) => [tl.label.name, tl.label.userId])).toEqual([['Blocker', U.guest]]);
  });

  it('a guest cannot apply a template into the workspace', async () => {
    const [template] = await templateService.getWorkspaceTemplates(workspaceId, U.guest);
    await expect(
      templateService.applyTemplate(template.id, { name: 'Team copy', workspaceId }, U.guest),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      templateService.applyTemplate(template.id, { name: 'Team copy', workspaceId }, U.member),
    ).resolves.toMatchObject({ workspaceId });
  });

  it('only the author can edit or delete a template', async () => {
    const [template] = await templateService.getWorkspaceTemplates(workspaceId, U.owner);
    await expect(templateService.updateTemplate(template.id, { name: 'x' }, U.owner)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(templateService.updateTemplate(template.id, { name: 'Launch v2' }, U.member)).resolves.toMatchObject({ name: 'Launch v2' });
    await expect(templateService.deleteTemplate(template.id, U.guest)).rejects.toBeInstanceOf(ForbiddenError);
    await templateService.deleteTemplate(template.id, U.member);
    expect(await templateService.getWorkspaceTemplates(workspaceId, U.member)).toEqual([]);
  });
});
