import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import * as taskService from '../../services/taskService.js';
import * as projectService from '../../services/projectService.js';
import { searchTasks } from '../../services/searchService.js';
import { getDueReminders } from '../../services/reminderService.js';
import { ForbiddenError, NotFoundError } from '../../errors/index.js';
import { dbFixtures } from './fixtures.js';

const fx = dbFixtures('trash');
let me = '';
let outsider = '';
let projectId = '';

async function task(content: string, extra: Record<string, unknown> = {}) {
  return prisma.task.create({ data: { content, projectId, creatorId: me, ...extra } });
}

beforeAll(async () => {
  me = (await fx.user('me')).id;
  outsider = (await fx.user('outsider')).id;
  projectId = (await prisma.project.create({ data: { name: 'Trash test', ownerId: me } })).id;
});
afterAll(async () => {
  await fx.cleanup();
  await prisma.$disconnect();
});

describe('trash', () => {
  it('a deleted task and its subtasks disappear from lists, counts and search', async () => {
    const parent = await task(`zqxtrash parent ${fx.run}`);
    await task('child', { parentId: parent.id });
    await taskService.deleteTask(parent.id, me);

    expect((await taskService.getTasks({ projectId }, me)).tasks.map((t) => t.id)).not.toContain(parent.id);
    await expect(taskService.getTaskById(parent.id, me)).rejects.toBeInstanceOf(NotFoundError);
    const project = await projectService.getProjectById(projectId, me);
    expect(project._count.tasks).toBe(0);
    expect(await searchTasks(`zqxtrash`, me)).toEqual([]);
  });

  it('lists what was trashed, not the subtasks that went with it', async () => {
    const trash = await taskService.getTrash(me);
    expect(trash.map((t) => t.content)).toEqual([`zqxtrash parent ${fx.run}`]);
    const purgeInDays = (trash[0].purgeAt.getTime() - trash[0].deletedAt.getTime()) / 86_400_000;
    expect(purgeInDays).toBe(30);
    expect(await taskService.getTrash(outsider)).toEqual([]);
  });

  it('restores a task with the subtasks trashed with it', async () => {
    const [trashed] = await taskService.getTrash(me);
    await expect(taskService.restoreTask(trashed.id, outsider)).rejects.toBeInstanceOf(ForbiddenError);
    const restored = await taskService.restoreTask(trashed.id, me);
    expect(restored.subtasks.map((s) => s.content)).toEqual(['child']);
    expect(restored._count.subtasks).toBe(1);
    expect(await taskService.getTrash(me)).toEqual([]);
  });

  it('a subtask restored while its parent is still trashed comes back top-level', async () => {
    const parent = await task('parent 2');
    const child = await task('child 2', { parentId: parent.id });
    await taskService.deleteTask(child.id, me);
    await taskService.deleteTask(parent.id, me);

    const restored = await taskService.restoreTask(child.id, me);
    expect(restored.parentId).toBeNull();
    // The parent is still in the trash, on its own.
    expect((await taskService.getTrash(me)).map((t) => t.content)).toEqual(['parent 2']);
  });

  it('only trashed tasks can be restored or deleted forever', async () => {
    const live = await task('live');
    await expect(taskService.restoreTask(live.id, me)).rejects.toBeInstanceOf(NotFoundError);
    await expect(taskService.purgeTask(live.id, me)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('delete forever removes it for good', async () => {
    const [trashed] = await taskService.getTrash(me);
    await taskService.purgeTask(trashed.id, me);
    expect(await prisma.task.findFirst({ where: { id: trashed.id, deletedAt: { not: null } } })).toBeNull();
  });

  it('the maintenance purge deletes only what has been trashed for 30 days', async () => {
    const old = await task('old', { deletedAt: new Date(Date.now() - 31 * 86_400_000) });
    const recent = await task('recent', { deletedAt: new Date(Date.now() - 29 * 86_400_000) });
    await taskService.purgeExpiredTrash();
    const left = await prisma.task.findMany({
      where: { id: { in: [old.id, recent.id] }, deletedAt: { not: null } },
      select: { content: true },
    });
    expect(left.map((t) => t.content)).toEqual(['recent']);
  });

  it('reminders on trashed tasks never fire', async () => {
    const t = await task('reminded');
    await prisma.reminder.create({
      data: { taskId: t.id, userId: me, type: 'ABSOLUTE', triggerAt: new Date(Date.now() - 60_000) },
    });
    expect((await getDueReminders()).some((r) => r.taskId === t.id)).toBe(true);
    await taskService.deleteTask(t.id, me);
    expect((await getDueReminders()).some((r) => r.taskId === t.id)).toBe(false);
  });
});

describe('moving across projects', () => {
  it('a subtask moved to another project becomes top-level there', async () => {
    const other = await prisma.project.create({ data: { name: 'Elsewhere', ownerId: me } });
    const parent = await task('parent 3');
    const child = await task('child 3', { parentId: parent.id });
    const moved = await taskService.moveTask(child.id, { projectId: other.id }, me);
    expect(moved.projectId).toBe(other.id);
    expect(moved.parentId).toBeNull();
  });

  it('quick add in a section files the task there, unless the text names another project', async () => {
    const section = await prisma.section.create({ data: { name: 'Later', projectId } });
    const here = await taskService.quickAddTask('Buy stamps', projectId, me, { sectionId: section.id });
    expect(here.sectionId).toBe(section.id);
    await prisma.project.create({ data: { name: `Elsewhere${fx.run}`, ownerId: me } });
    const there = await taskService.quickAddTask(`Buy stamps #Elsewhere${fx.run}`, projectId, me, { sectionId: section.id });
    expect(there.sectionId).toBeNull();
  });
});

describe('bulk actions', () => {
  it('bulk delete takes subtasks to the trash however deep, and bulk restore brings them back', async () => {
    const parent = await prisma.task.create({ data: { content: 'Parent', projectId, creatorId: me } });
    const child = await prisma.task.create({ data: { content: 'Child', projectId, creatorId: me, parentId: parent.id } });
    const grandchild = await prisma.task.create({ data: { content: 'Grandchild', projectId, creatorId: me, parentId: child.id } });
    const trashed = () =>
      prisma.task.findMany({ where: { id: { in: [parent.id, child.id, grandchild.id] }, deletedAt: { not: null } }, select: { id: true } });

    await taskService.bulkUpdate({ taskIds: [parent.id], action: 'delete' }, me);
    expect((await trashed()).length).toBe(3);

    await taskService.bulkUpdate({ taskIds: [parent.id], action: 'restore' }, me);
    expect((await trashed()).length).toBe(0);
  });

  it('sets and clears due dates, keeping times on a new date', async () => {
    const a = await task('bulk a', { dueDate: new Date('2027-01-01T00:00:00Z'), dueTime: '09:30' });
    const b = await task('bulk b');
    await taskService.bulkUpdate({ taskIds: [a.id, b.id], action: 'setDueDate', data: { dueDate: '2027-02-03' } }, me);
    const after = await prisma.task.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { content: 'asc' } });
    expect(after.map((t) => [t.dueDate?.toISOString().slice(0, 10), t.dueTime])).toEqual([
      ['2027-02-03', '09:30'],
      ['2027-02-03', null],
    ]);
    await taskService.bulkUpdate({ taskIds: [a.id], action: 'setDueDate', data: { dueDate: null } }, me);
    expect(await prisma.task.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ dueDate: null, dueTime: null });
  });

  it('adds and removes your own labels, and refuses someone else’s', async () => {
    const mine = await prisma.label.create({ data: { name: `bulk ${fx.run}`, userId: me } });
    const theirs = await prisma.label.create({ data: { name: `theirs ${fx.run}`, userId: outsider } });
    const a = await task('labelled a');
    const b = await task('labelled b', { taskLabels: { create: [{ labelId: mine.id }] } });

    await taskService.bulkUpdate({ taskIds: [a.id, b.id], action: 'addLabels', data: { labelIds: [mine.id] } }, me);
    expect(await prisma.taskLabel.count({ where: { labelId: mine.id } })).toBe(2);
    await taskService.bulkUpdate({ taskIds: [a.id, b.id], action: 'removeLabels', data: { labelIds: [mine.id] } }, me);
    expect(await prisma.taskLabel.count({ where: { labelId: mine.id } })).toBe(0);
    await expect(
      taskService.bulkUpdate({ taskIds: [a.id], action: 'addLabels', data: { labelIds: [theirs.id] } }, me),
    ).rejects.toThrow();
  });

  it('a bulk delete can be undone with a bulk restore, subtasks included', async () => {
    const a = await task('undo a');
    const child = await task('undo child', { parentId: a.id });
    const b = await task('undo b');
    await taskService.bulkUpdate({ taskIds: [a.id, b.id], action: 'delete' }, me);
    expect(await prisma.task.count({ where: { id: { in: [a.id, b.id, child.id] } } })).toBe(0);

    await taskService.bulkUpdate({ taskIds: [a.id, b.id], action: 'restore' }, me);
    expect(await prisma.task.count({ where: { id: { in: [a.id, b.id, child.id] } } })).toBe(3);
  });

  it('a bulk move to another project detaches subtasks from parents left behind', async () => {
    const other = await prisma.project.create({ data: { name: 'Bulk target', ownerId: me } });
    const parent = await task('staying parent');
    const child = await task('moving child', { parentId: parent.id });
    await taskService.bulkUpdate({ taskIds: [child.id], action: 'move', data: { projectId: other.id } }, me);
    expect(await prisma.task.findUniqueOrThrow({ where: { id: child.id } })).toMatchObject({
      projectId: other.id,
      parentId: null,
    });
  });
});
