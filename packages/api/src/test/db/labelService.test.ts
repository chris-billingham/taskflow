import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import * as labelService from '../../services/labelService.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../errors/index.js';
import { dbFixtures } from './fixtures.js';

const fx = dbFixtures('labels');
let me = '';
let other = '';

beforeAll(async () => {
  me = (await fx.user('me')).id;
  other = (await fx.user('other')).id;
});
afterAll(async () => {
  await fx.cleanup();
  await prisma.$disconnect();
});

describe('labelService', () => {
  it('creates labels in order with a default colour', async () => {
    const a = await labelService.createLabel({ name: 'Errand' }, me);
    const b = await labelService.createLabel({ name: 'Deep work', color: '#112233' }, me);
    expect(a.color).toBe('#6B7280');
    expect(b.sortOrder).toBeGreaterThan(a.sortOrder);
    expect((await labelService.getUserLabels(me)).map((l) => l.name)).toEqual(['Errand', 'Deep work']);
  });

  it('refuses a duplicate name whatever its case', async () => {
    await expect(labelService.createLabel({ name: 'errand' }, me)).rejects.toBeInstanceOf(ConflictError);
  });

  it('lets another user reuse the name', async () => {
    await expect(labelService.createLabel({ name: 'Errand' }, other)).resolves.toBeTruthy();
  });

  it('allows recasing a label’s own name but not taking another’s', async () => {
    const [errand, deep] = await labelService.getUserLabels(me);
    await expect(labelService.updateLabel(errand.id, { name: 'ERRAND' }, me)).resolves.toMatchObject({ name: 'ERRAND' });
    await expect(labelService.updateLabel(deep.id, { name: 'errand' }, me)).rejects.toBeInstanceOf(ConflictError);
  });

  it('only the owner can change or delete a label', async () => {
    const [errand] = await labelService.getUserLabels(me);
    await expect(labelService.updateLabel(errand.id, { name: 'Mine now' }, other)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(labelService.deleteLabel(errand.id, other)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(labelService.deleteLabel('missing', me)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('reorders, refusing someone else’s labels', async () => {
    const [a, b] = await labelService.getUserLabels(me);
    await labelService.reorderLabels([b.id, a.id], me);
    expect((await labelService.getUserLabels(me)).map((l) => l.id)).toEqual([b.id, a.id]);
    const [theirs] = await labelService.getUserLabels(other);
    await expect(labelService.reorderLabels([a.id, theirs.id], me)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('deleting a label detaches it from tasks', async () => {
    const project = await prisma.project.create({ data: { name: 'L', ownerId: me } });
    const [label] = await labelService.getUserLabels(me);
    const task = await prisma.task.create({
      data: { content: 't', projectId: project.id, creatorId: me, taskLabels: { create: [{ labelId: label.id }] } },
    });
    await labelService.deleteLabel(label.id, me);
    expect(await prisma.taskLabel.count({ where: { taskId: task.id } })).toBe(0);
  });
});
