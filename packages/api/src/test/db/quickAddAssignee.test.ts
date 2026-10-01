import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../../config/database.js';
import * as taskService from '../../services/taskService.js';
import * as filterService from '../../services/filterService.js';
import { dbFixtures } from './fixtures.js';

const fx = dbFixtures('qaassign');
const U: Record<string, string> = {};
let team = '';

beforeAll(async () => {
  U.ann = (await prisma.user.create({ data: { email: `ann@qaassign-${fx.run}.test`, passwordHash: 'x', name: 'Ann Archer' } })).id;
  U.ben = (await prisma.user.create({ data: { email: `ben@qaassign-${fx.run}.test`, passwordHash: 'x', name: 'Ben Baker' } })).id;
  const ws = await fx.workspace(U.ann, { [U.ben]: 'MEMBER' });
  team = (await prisma.project.create({ data: { name: 'Launch', ownerId: U.ann, workspaceId: ws.id } })).id;
});
afterAll(async () => {
  await fx.cleanup();
  await prisma.$disconnect();
});

describe('quick add +person', () => {
  it('assigns a teammate by first name and tells them', async () => {
    const task = await taskService.quickAddTask('Write the press release +ben', team, U.ann);
    expect(task.content).toBe('Write the press release');
    expect(task.assigneeId).toBe(U.ben);
    // Notifying happens after the response, in the background.
    await vi.waitFor(async () =>
      expect(await prisma.notification.count({ where: { userId: U.ben, type: 'TASK_ASSIGNED' } })).toBe(1),
    );
  });

  it('+me assigns it to you', async () => {
    const task = await taskService.quickAddTask('Book the room +me', team, U.ann);
    expect(task.assigneeId).toBe(U.ann);
  });

  it('"Assigned to me" lists your open assigned tasks', async () => {
    const done = await taskService.quickAddTask('Already done +me', team, U.ann);
    await taskService.completeTask(done.id, U.ann);
    await taskService.quickAddTask('Not mine +ben', team, U.ann);
    const { items } = await filterService.executeFilter('assigned to: me & !completed', U.ann);
    expect(items.map((t) => t.content).sort()).toEqual(['Book the room']);
  });
});
