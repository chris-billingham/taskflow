import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import * as labelService from '../../services/labelService.js';
import * as taskService from '../../services/taskService.js';
import { parseFilterQuery } from '../../utils/filterParser.js';
import { taskAccessWhere } from '../../services/access.js';
import { ForbiddenError, ValidationError } from '../../errors/index.js';
import { dbFixtures } from './fixtures.js';

const fx = dbFixtures('sharedlabels');
const U: Record<string, string> = {};
let ws = '';
let team = '';
let home = '';
const L: Record<string, string> = {};

const labelNames = async (taskId: string) =>
  (await prisma.taskLabel.findMany({ where: { taskId }, include: { label: true } }))
    .map((tl) => `${tl.label.name}@${tl.label.workspaceId ? 'team' : tl.label.userId === U.ann ? 'ann' : 'other'}`)
    .sort();

beforeAll(async () => {
  for (const name of ['ann', 'ben', 'guest', 'cal']) U[name] = (await fx.user(name)).id;
  ws = (await fx.workspace(U.ann, { [U.ben]: 'MEMBER', [U.guest]: 'GUEST' })).id;
  team = (await prisma.project.create({ data: { name: `Team ${fx.run}`, ownerId: U.ann, workspaceId: ws } })).id;
  home = (await prisma.project.create({ data: { name: `Home ${fx.run}`, ownerId: U.ann } })).id;
  // Every account has an Inbox (quick add falls back to it).
  await prisma.project.create({ data: { name: 'Inbox', ownerId: U.ben, isInbox: true } });
  // Ann shares her own project with Cal.
  await prisma.projectMember.create({ data: { projectId: home, userId: U.cal, role: 'MEMBER' } });
  L.annErrand = (await labelService.createLabel({ name: 'Errand' }, U.ann)).id;
  L.annUrgent = (await labelService.createLabel({ name: 'Urgent' }, U.ann)).id;
});
afterAll(async () => {
  await prisma.project.deleteMany({ where: { OR: [{ id: home }, { ownerId: U.ben, isInbox: true }] } });
  await fx.cleanup();
  await prisma.$disconnect();
});

describe('team labels', () => {
  it('workspace members create them and everyone in the workspace sees them, except guests', async () => {
    const urgent = await labelService.createLabel({ name: 'Urgent', workspaceId: ws }, U.ben);
    L.teamUrgent = urgent.id;
    expect(urgent).toMatchObject({ workspaceId: ws, userId: null });
    expect((await labelService.getLabels(U.ann)).map((l) => l.id)).toContain(urgent.id);
    expect((await labelService.getLabels(U.guest)).map((l) => l.id)).not.toContain(urgent.id);
    await expect(labelService.createLabel({ name: 'Nope', workspaceId: ws }, U.guest)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a project lists the labels its tasks can use', async () => {
    expect((await labelService.getLabels(U.ben, { projectId: team })).map((l) => l.id)).toEqual([L.teamUrgent]);
    // Cal works in Ann's shared project, so Ann's labels are the ones to use there.
    expect((await labelService.getLabels(U.cal, { projectId: home })).map((l) => l.name).sort()).toEqual(['Errand', 'Urgent']);
  });

  it('a favourite on a team label is yours alone', async () => {
    await labelService.updateLabel(L.teamUrgent, { isFavorite: true }, U.ben);
    const forBen = (await labelService.getLabels(U.ben)).find((l) => l.id === L.teamUrgent);
    const forAnn = (await labelService.getLabels(U.ann)).find((l) => l.id === L.teamUrgent);
    expect([forBen?.isFavorite, forAnn?.isFavorite]).toEqual([true, false]);
  });

  it('only the owner can rename a personal label, even in a shared project', async () => {
    await expect(labelService.updateLabel(L.annErrand, { name: 'Mine' }, U.cal)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('tasks use their project’s labels', () => {
  it('refuses a label from another space', async () => {
    await expect(
      taskService.createTask({ content: 'x', projectId: team, labelIds: [L.annErrand] }, U.ann),
    ).rejects.toBeInstanceOf(ValidationError);
    const task = await taskService.createTask({ content: 'Ship it', projectId: team, labelIds: [L.teamUrgent] }, U.ann);
    expect(await labelNames(task.id)).toEqual(['Urgent@team']);
  });

  it('editing labels on a team task changes them for everyone, without losing anyone’s', async () => {
    const errand = await labelService.createLabel({ name: 'Errand', workspaceId: ws }, U.ann);
    const task = await taskService.createTask({ content: 'Shared', projectId: team, labelIds: [L.teamUrgent] }, U.ann);
    await taskService.updateTask(task.id, { labelIds: [L.teamUrgent, errand.id] }, U.ben);
    expect(await labelNames(task.id)).toEqual(['Errand@team', 'Urgent@team']);
  });

  it('a collaborator tags tasks in a shared personal project with the owner’s labels', async () => {
    const task = await taskService.createTask({ content: 'Fix fence', projectId: home, labelIds: [L.annErrand] }, U.cal);
    expect(await labelNames(task.id)).toEqual(['Errand@ann']);
  });

  it('moving a task into another space takes its labels along by name', async () => {
    const task = await taskService.createTask(
      { content: 'Buy paint', projectId: home, labelIds: [L.annErrand, L.annUrgent] },
      U.ann,
    );
    await taskService.moveTask(task.id, { projectId: team }, U.ann);
    expect(await labelNames(task.id)).toEqual(['Errand@team', 'Urgent@team']);
  });

  it('bulk labelling applies the label of that name in each task’s space', async () => {
    const a = await taskService.createTask({ content: 'A', projectId: team }, U.ann);
    const b = await taskService.createTask({ content: 'B', projectId: home }, U.ann);
    await taskService.bulkUpdate({ taskIds: [a.id, b.id], action: 'addLabels', data: { labelIds: [L.teamUrgent] } }, U.ann);
    expect(await labelNames(a.id)).toEqual(['Urgent@team']);
    expect(await labelNames(b.id)).toEqual(['Urgent@ann']);

    await taskService.bulkUpdate({ taskIds: [a.id, b.id], action: 'removeLabels', data: { labelIds: [L.annUrgent] } }, U.ann);
    expect([...(await labelNames(a.id)), ...(await labelNames(b.id))]).toEqual([]);
  });

  it('quick add matches @labels in the project the task lands in', async () => {
    const task = await taskService.quickAddTask(`Book venue @urgent #Team ${fx.run}`, undefined, U.ben);
    expect(task.projectId).toBe(team);
    expect(await labelNames(task.id)).toEqual(['Urgent@team']);
  });

  it('a filter @label matches that name in every space you can see', async () => {
    await taskService.createTask({ content: 'Call plumber', projectId: home, labelIds: [L.annUrgent] }, U.ann);
    const where = { AND: [await parseFilterQuery('@urgent', U.ann), taskAccessWhere(U.ann)] };
    const found = await prisma.task.findMany({ where, select: { projectId: true } });
    expect(new Set(found.map((t) => t.projectId))).toEqual(new Set([team, home]));
  });
});
