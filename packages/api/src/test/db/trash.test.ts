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
