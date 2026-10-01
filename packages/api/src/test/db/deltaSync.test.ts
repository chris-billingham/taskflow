import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../config/database.js';
import { buildTestApp } from '../integration/buildTestApp.js';
import { generateAccessToken } from '../../utils/jwt.js';
import { sync, pruneTombstones, SYNC_FLOOR_KEY } from '../../services/deltaSync.js';
import * as taskService from '../../services/taskService.js';
import * as projectSharing from '../../services/projectSharing.js';
import { dbFixtures } from './fixtures.js';

const fx = dbFixtures('deltasync');
let app: FastifyInstance;
const U: Record<string, { id: string; email: string; name: string }> = {};
let home = '';
let theirs = '';
let label = '';

const headers = (who: string) => ({ authorization: `Bearer ${generateAccessToken(U[who])}` });
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
  for (const name of ['ann', 'ben']) {
    const user = await fx.user(name);
    U[name] = { id: user.id, email: user.email, name: user.name };
  }
  home = (await prisma.project.create({ data: { name: 'Home', ownerId: U.ann.id } })).id;
  theirs = (await prisma.project.create({ data: { name: 'Ben’s', ownerId: U.ben.id } })).id;
  label = (await prisma.label.create({ data: { name: 'Errand', userId: U.ann.id } })).id;
  await prisma.task.create({ data: { content: 'Ben only', projectId: theirs, creatorId: U.ben.id } });
});
afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: [home, theirs] } } });
  await prisma.instanceSetting.deleteMany({ where: { key: SYNC_FLOOR_KEY } });
  await app.close();
  await fx.cleanup();
  await prisma.$disconnect();
});

describe('GET /sync', () => {
  it('a full sync returns what you can see, and a cursor', async () => {
    const task = await taskService.createTask({ content: 'Buy milk', projectId: home }, U.ann.id);
    const res = await app.inject({ method: 'GET', url: '/api/v1/sync', headers: headers('ann') });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.cursor).toMatch(/^\d+$/);
    expect(data.reset).toBe(false);
    expect(data.projectIds).toContain(home);
    expect(data.projectIds).not.toContain(theirs);
    expect(ids(data.tasks)).toEqual([task.id]);
    expect(ids(data.labels)).toEqual([label]);
    expect(data.tasks[0]).toMatchObject({ version: 1, labelIds: [], deletedAt: null });
  });

  it('a delta carries only what changed: an edit, a label, the trash and a purge', async () => {
    const keep = await taskService.createTask({ content: 'Untouched', projectId: home }, U.ann.id);
    const edit = await taskService.createTask({ content: 'Edit me', projectId: home }, U.ann.id);
    const trash = await taskService.createTask({ content: 'Trash me', projectId: home }, U.ann.id);
    const purge = await taskService.createTask({ content: 'Purge me', projectId: home }, U.ann.id);
    const { cursor } = await sync(U.ann.id);

    await taskService.updateTask(edit.id, { content: 'Edited', labelIds: [label] }, U.ann.id);
    await taskService.deleteTask(trash.id, U.ann.id);
    await prisma.task.delete({ where: { id: purge.id } });

    const delta = await sync(U.ann.id, cursor);
    const byId = new Map(delta.tasks.map((t) => [t.id, t]));
    expect(byId.has(keep.id)).toBe(false);
    expect(byId.get(edit.id)).toMatchObject({ content: 'Edited', labelIds: [label] });
    expect(byId.get(edit.id)!.version).toBeGreaterThan(1);
    expect(byId.get(trash.id)?.deletedAt).toBeInstanceOf(Date);
    expect(delta.deleted.tasks).toContain(purge.id);
  });

  it('your favourite syncs to you, not to everyone', async () => {
    await prisma.projectMember.create({ data: { projectId: home, userId: U.ben.id, role: 'MEMBER' } });
    const annCursor = (await sync(U.ann.id)).cursor;
    const benCursor = (await sync(U.ben.id)).cursor;
    await prisma.projectUserSetting.create({ data: { userId: U.ben.id, projectId: home, isFavorite: true } });

    expect((await sync(U.ben.id, benCursor)).projects.find((p) => p.id === home)?.isFavorite).toBe(true);
    expect((await sync(U.ann.id, annCursor)).projects.map((p) => p.id)).not.toContain(home);
    await prisma.projectUserSetting.deleteMany({ where: { projectId: home } });
    await prisma.projectMember.deleteMany({ where: { projectId: home } });
  });

  it('a project shared with you arrives whole; one taken away drops out of projectIds', async () => {
    const { cursor } = await sync(U.ann.id);
    await projectSharing.shareProject(theirs, { email: U.ann.email, role: 'VIEWER' }, U.ben.id);
    const gained = await sync(U.ann.id, cursor);
    expect(gained.projectIds).toContain(theirs);
    expect(gained.projects.map((p) => p.id)).toContain(theirs);
    expect(gained.tasks.map((t) => t.content)).toContain('Ben only');

    await projectSharing.removeCollaborator(theirs, U.ann.id, U.ben.id);
    expect((await sync(U.ann.id, gained.cursor)).projectIds).not.toContain(theirs);
  });

  it('does not miss an edit committed after the sync began by a transaction that started before it', async () => {
    const task = await taskService.createTask({ content: 'Racing', projectId: home }, U.ann.id);
    let cursor = '';
    await prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id: task.id }, data: { content: 'Committed late' } });
      // Another connection syncs while this edit is still uncommitted.
      cursor = (await sync(U.ann.id)).cursor;
    });
    const next = await sync(U.ann.id, cursor);
    expect(next.tasks.find((t) => t.id === task.id)?.content).toBe('Committed late');
  });

  it('tells a client with a cursor older than the pruned tombstones to start again', async () => {
    const { cursor } = await sync(U.ann.id);
    const doomed = await taskService.createTask({ content: 'Old news', projectId: home }, U.ann.id);
    await prisma.task.delete({ where: { id: doomed.id } });
    await prisma.syncTombstone.updateMany({ where: { entityId: doomed.id }, data: { deletedAt: new Date('2020-01-01') } });
    await pruneTombstones(90);
    const res = await sync(U.ann.id, cursor);
    expect(res.reset).toBe(true);
    expect(res.tasks.length).toBeGreaterThan(0);
  });
});

describe('versions', () => {
  it('a stale ifVersion is refused with the current task; the right one goes through', async () => {
    const task = await taskService.createTask({ content: 'Draft', projectId: home }, U.ann.id);
    const first = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${task.id}`,
      headers: headers('ann'),
      payload: { content: 'Mine', labelIds: [label], ifVersion: 1 },
    });
    expect(first.statusCode).toBe(200);
    const now = first.json().data.version;

    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${task.id}`,
      headers: headers('ann'),
      payload: { content: 'Theirs', ifVersion: 1 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: 'VERSION_CONFLICT', current: { content: 'Mine', version: now } });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).content).toBe('Mine');
  });

  it('projects check it too', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/api/v1/projects/${home}`, headers: headers('ann'), payload: { name: 'X', ifVersion: 999 } });
    expect(res.statusCode).toBe(409);
  });
});

describe('client-chosen ids', () => {
  const id = `offline-task-${Date.now()}-abcdef`;
  it('a retried create returns the first task instead of a duplicate', async () => {
    const body = { id, content: 'Made offline', projectId: home };
    const a = await app.inject({ method: 'POST', url: '/api/v1/tasks', headers: headers('ann'), payload: body });
    const b = await app.inject({ method: 'POST', url: '/api/v1/tasks', headers: headers('ann'), payload: body });
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
    expect(b.json().data.id).toBe(id);
    expect(await prisma.task.count({ where: { id } })).toBe(1);
  });

  it('someone else using that id is a conflict', async () => {
    await prisma.projectMember.create({ data: { projectId: home, userId: U.ben.id, role: 'MEMBER' } });
    const res = await app.inject({ method: 'POST', url: '/api/v1/tasks', headers: headers('ben'), payload: { id, content: 'Mine?', projectId: home } });
    expect(res.statusCode).toBe(409);
    await prisma.projectMember.deleteMany({ where: { projectId: home } });
  });
});

describe('fractional ordering', () => {
  it('placing a task changes only that task', async () => {
    const project = (await prisma.project.create({ data: { name: 'Order', ownerId: U.ann.id } })).id;
    const made: { id: string }[] = [];
    for (const content of ['A', 'B', 'C']) made.push(await taskService.createTask({ content, projectId: project }, U.ann.id));
    const before = await prisma.task.findMany({ where: { projectId: project }, select: { id: true, version: true } });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${made[2].id}/position`,
      headers: headers('ann'),
      payload: { afterId: made[0].id },
    });
    expect(res.statusCode).toBe(200);

    const order = await prisma.task.findMany({ where: { projectId: project }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
    expect(order.map((t) => t.content)).toEqual(['A', 'C', 'B']);
    const bumped = order.filter((t) => t.version !== before.find((x) => x.id === t.id)!.version).map((t) => t.content);
    expect(bumped).toEqual(['C']);

    // First in the list.
    await taskService.positionTask(made[1].id, null, U.ann.id);
    expect((await prisma.task.findMany({ where: { projectId: project }, orderBy: { sortOrder: 'asc' } })).map((t) => t.content)).toEqual(['B', 'A', 'C']);
    await prisma.project.delete({ where: { id: project } });
  });

  it('renumbers the list once the gap runs out, keeping the order', async () => {
    const project = (await prisma.project.create({ data: { name: 'Tight', ownerId: U.ann.id } })).id;
    const a = await taskService.createTask({ content: 'A', projectId: project }, U.ann.id);
    const b = await taskService.createTask({ content: 'B', projectId: project }, U.ann.id);
    const c = await taskService.createTask({ content: 'C', projectId: project }, U.ann.id);
    await prisma.task.update({ where: { id: b.id }, data: { sortOrder: 1 + 1e-9 } });
    await prisma.task.update({ where: { id: a.id }, data: { sortOrder: 1 } });
    await taskService.positionTask(c.id, a.id, U.ann.id);
    const order = await prisma.task.findMany({ where: { projectId: project }, orderBy: { sortOrder: 'asc' } });
    expect(order.map((t) => t.content)).toEqual(['A', 'C', 'B']);
    expect(order.map((t) => t.sortOrder)).toEqual([0, 1, 2]);
    await prisma.project.delete({ where: { id: project } });
  });

  it('refuses a neighbour from another list', async () => {
    const task = await taskService.createTask({ content: 'Here', projectId: home }, U.ann.id);
    const other = await prisma.task.findFirstOrThrow({ where: { projectId: theirs } });
    await expect(taskService.positionTask(task.id, other.id, U.ann.id)).rejects.toThrow(/same list/);
  });
});
