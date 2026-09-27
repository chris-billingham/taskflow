import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/database.js';
import * as taskService from '../../services/taskService.js';
import * as filterService from '../../services/filterService.js';
import * as commentService from '../../services/commentService.js';
import * as activityService from '../../services/activityService.js';
import * as notificationService from '../../services/notificationService.js';

// Every paged list, walked two rows at a time against a real database: each
// row must appear exactly once, in the same order as one unpaged read. Rows
// share timestamps and sort keys on purpose, since ties are where cursors
// skip or repeat rows.

const RUN = randomUUID().slice(0, 8);
let userId = '';
let projectId = '';
let taskId = '';

type Page = { items: Array<{ id: string }>; nextCursor: string | null };

async function walk(fetch: (cursor?: string) => Promise<Page>) {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 50; i++) {
    const page = await fetch(cursor);
    ids.push(...page.items.map((r) => r.id));
    if (!page.nextCursor) return ids;
    cursor = page.nextCursor;
  }
  throw new Error('pagination did not terminate');
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `pg-${RUN}@paging.test`, passwordHash: 'x', name: 'pg', emailVerified: true },
  });
  userId = user.id;
  projectId = (await prisma.project.create({ data: { name: `Paging ${RUN}`, ownerId: userId } })).id;

  const sameTime = new Date('2027-03-01T09:00:00Z');
  for (let i = 0; i < 9; i++) {
    await prisma.task.create({
      data: {
        content: `task ${i}`,
        projectId,
        creatorId: userId,
        priority: 1 + (i % 2),
        dueDate: i % 3 === 0 ? null : new Date(Date.UTC(2027, 0, 1 + (i % 2))),
        sortOrder: i % 3,
      },
    });
  }
  taskId = (await prisma.task.findFirstOrThrow({ where: { projectId } })).id;

  for (let i = 0; i < 5; i++) {
    await prisma.comment.create({ data: { content: `c${i}`, taskId, authorId: userId, createdAt: sameTime } });
    await prisma.activityLog.create({
      data: { userId, action: 'UPDATED', entityType: 'TASK', entityId: taskId, taskId, createdAt: sameTime },
    });
    await prisma.notification.create({
      data: { userId, type: 'REMINDER', title: `n${i}`, body: 'b', createdAt: sameTime },
    });
  }
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: `pg-${RUN}@paging.test` } });
  await prisma.$disconnect();
});

describe('cursor pagination', () => {
  it('tasks', async () => {
    const all = await taskService.getTasks({ projectId }, userId);
    const paged = await walk(async (cursor) => {
      const r = await taskService.getTasks({ projectId, limit: 2, cursor }, userId);
      return { items: r.tasks, nextCursor: r.nextCursor };
    });
    expect(paged).toHaveLength(9);
    expect(paged).toEqual(all.tasks.map((t) => t.id));
  });

  it('filter results, sorted on a nullable due date', async () => {
    const all = await filterService.executeFilter('p1 | p2', userId, 200);
    const mine = all.items.filter((t) => t.projectId === projectId).map((t) => t.id);
    expect(mine).toHaveLength(9);
    const paged = await walk((cursor) => filterService.executeFilter('p1 | p2', userId, 2, cursor));
    expect(paged.filter((id) => mine.includes(id))).toEqual(mine);
    expect(new Set(paged).size).toBe(paged.length);
  });

  it('comments', async () => {
    const paged = await walk((cursor) => commentService.getTaskComments(taskId, userId, 2, cursor));
    expect(paged).toHaveLength(5);
    expect(new Set(paged).size).toBe(5);
    expect(paged).toEqual((await commentService.getTaskComments(taskId, userId, 100)).items.map((c) => c.id));
  });

  it('activity', async () => {
    const paged = await walk((cursor) => activityService.getTaskActivity(taskId, userId, 2, cursor));
    expect(paged).toHaveLength(5);
    expect(new Set(paged).size).toBe(5);
  });

  it('notifications', async () => {
    const paged = await walk((cursor) => notificationService.getUserNotifications(userId, false, 2, cursor));
    expect(paged).toHaveLength(5);
    expect(new Set(paged).size).toBe(5);
  });

  it('reports no next page when the last page is exactly full', async () => {
    const page = await notificationService.getUserNotifications(userId, false, 5);
    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBeNull();
  });
});
