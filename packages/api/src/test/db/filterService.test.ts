import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import * as filterService from '../../services/filterService.js';
import { ForbiddenError, ValidationError } from '../../errors/index.js';
import { dbFixtures } from './fixtures.js';

const fx = dbFixtures('filters');
let me = '';
let other = '';
let projectId = '';

beforeAll(async () => {
  me = (await fx.user('me')).id;
  other = (await fx.user('other')).id;
  projectId = (await prisma.project.create({ data: { name: `Work${fx.run}`, ownerId: me } })).id;
  await prisma.task.createMany({
    data: [
      { content: 'urgent open', projectId, creatorId: me, priority: 1 },
      { content: 'low open', projectId, creatorId: me, priority: 4 },
      { content: 'urgent done', projectId, creatorId: me, priority: 1, isCompleted: true },
    ],
  });
});
afterAll(async () => {
  await fx.cleanup();
  await prisma.$disconnect();
});

describe('filterService', () => {
  it('saves a filter with defaults', async () => {
    const f = await filterService.createFilter({ name: 'Urgent', query: 'p1' }, me);
    expect(f).toMatchObject({ color: '#6B7280', viewStyle: 'LIST', userId: me });
  });

  it('refuses to save or run a malformed query', async () => {
    await expect(filterService.createFilter({ name: 'Bad', query: 'p1 &' }, me)).rejects.toBeInstanceOf(ValidationError);
    await expect(filterService.createFilter({ name: 'Bad', query: '(p1' }, me)).rejects.toBeInstanceOf(ValidationError);
    const [saved] = await filterService.getUserFilters(me);
    await expect(filterService.updateFilter(saved.id, { query: '| p2' }, me)).rejects.toBeInstanceOf(ValidationError);
    await expect(filterService.executeFilter('p1 |', me)).rejects.toBeInstanceOf(ValidationError);
  });

  it('runs a query within what the user can see; completed tasks match unless excluded', async () => {
    const mine = await filterService.executeFilter('p1', me);
    expect(mine.items.map((t) => t.content).sort()).toEqual(['urgent done', 'urgent open']);
    const open = await filterService.executeFilter('p1 & !completed', me);
    expect(open.items.map((t) => t.content)).toEqual(['urgent open']);
    expect((await filterService.executeFilter('p1', other)).items).toEqual([]);
  });

  it('combines atoms with the project the user named', async () => {
    const result = await filterService.executeFilter(`#Work${fx.run} & p4`, me);
    expect(result.items.map((t) => t.content)).toEqual(['low open']);
  });

  it('only the owner can change or delete a filter', async () => {
    const [saved] = await filterService.getUserFilters(me);
    await expect(filterService.updateFilter(saved.id, { name: 'x' }, other)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(filterService.deleteFilter(saved.id, other)).rejects.toBeInstanceOf(ForbiddenError);
    await filterService.deleteFilter(saved.id, me);
    expect(await filterService.getUserFilters(me)).toEqual([]);
  });
});
