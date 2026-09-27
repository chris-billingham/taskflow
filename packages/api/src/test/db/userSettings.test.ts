import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const emitted = vi.hoisted(() => [] as { event: string; payload: Record<string, unknown> }[]);
vi.mock('../../websocket/events.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../websocket/events.js')>()),
  emitToProject: (_room: string, event: string, payload: Record<string, unknown>) => emitted.push({ event, payload }),
  emitToWorkspace: () => {},
}));

import { prisma } from '../../config/database.js';
import * as projectService from '../../services/projectService.js';
import * as sectionService from '../../services/sectionService.js';
import { ForbiddenError } from '../../errors/index.js';
import { dbFixtures } from './fixtures.js';

const fx = dbFixtures('usersettings');
const U: Record<string, string> = {};
let wsId = '';
const P: Record<string, string> = {};

beforeAll(async () => {
  for (const name of ['owner', 'member', 'guest']) U[name] = (await fx.user(name)).id;
  wsId = (await fx.workspace(U.owner, { [U.member]: 'MEMBER', [U.guest]: 'GUEST' })).id;
  for (const [key, name] of [['a', 'Alpha'], ['b', 'Beta'], ['c', 'Gamma']] as const) {
    P[key] = (await projectService.createProject({ name, workspaceId: wsId }, U.owner)).id;
  }
});
afterAll(async () => {
  await fx.cleanup();
  await prisma.$disconnect();
});

const listFor = async (userId: string) =>
  (await projectService.getUserProjects(userId)).filter((p) => p.workspaceId === wsId);
const order = (projects: { name: string; sortOrder: number }[]) =>
  [...projects].sort((x, y) => x.sortOrder - y.sortOrder).map((p) => p.name);

describe('per-user project settings', () => {
  it('a favourite is only yours, and anyone who can see the project may set one', async () => {
    const updated = await projectService.updateProject(P.a, { isFavorite: true }, U.guest);
    expect(updated.isFavorite).toBe(true);
    expect((await listFor(U.guest)).find((p) => p.id === P.a)?.isFavorite).toBe(true);
    expect((await listFor(U.owner)).find((p) => p.id === P.a)?.isFavorite).toBe(false);
  });

  it('a guest still cannot change the project itself', async () => {
    await expect(projectService.updateProject(P.a, { name: 'Renamed', isFavorite: false }, U.guest)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect((await listFor(U.guest)).find((p) => p.id === P.a)?.isFavorite).toBe(true);
  });

  it('each person keeps their own order; new projects go to the end', async () => {
    expect(order(await listFor(U.member))).toEqual(['Alpha', 'Beta', 'Gamma']);
    await projectService.reorderProjects([P.c, P.a, P.b], U.member);
    expect(order(await listFor(U.member))).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(order(await listFor(U.owner))).toEqual(['Alpha', 'Beta', 'Gamma']);

    await projectService.createProject({ name: 'Delta', workspaceId: wsId }, U.owner);
    expect(order(await listFor(U.member))).toEqual(['Gamma', 'Alpha', 'Beta', 'Delta']);
  });

  it('broadcasts leave out the changer’s own arrangement', async () => {
    emitted.length = 0;
    await projectService.updateProject(P.b, { color: '#112233', isFavorite: true }, U.owner);
    const event = emitted.find((e) => e.event === 'project:updated');
    expect(event?.payload.project).toMatchObject({ id: P.b, color: '#112233' });
    expect(event?.payload.project).not.toHaveProperty('isFavorite');
    expect(event?.payload.project).not.toHaveProperty('sortOrder');
  });
});

describe('per-user section collapse', () => {
  it('collapsing a section hides it for you only, and needs only view access', async () => {
    const section = await sectionService.createSection({ name: 'Later', projectId: P.a }, U.owner);
    expect(section.isCollapsed).toBe(false);

    expect((await sectionService.updateSection(section.id, { isCollapsed: true }, U.guest)).isCollapsed).toBe(true);
    const mine = await sectionService.getProjectSections(P.a, U.guest);
    const theirs = await sectionService.getProjectSections(P.a, U.owner);
    expect(mine.find((s) => s.id === section.id)?.isCollapsed).toBe(true);
    expect(theirs.find((s) => s.id === section.id)?.isCollapsed).toBe(false);

    await expect(sectionService.updateSection(section.id, { name: 'Nope' }, U.guest)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('the project detail shows your own collapse state', async () => {
    const detail = await projectService.getProjectById(P.a, U.guest);
    expect(detail.sections.find((s) => s.name === 'Later')?.isCollapsed).toBe(true);
  });
});
