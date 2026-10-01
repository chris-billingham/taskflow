import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/database.js';
import { findProjectByName } from '../../services/access.js';
import { reorderProjects } from '../../services/projectService.js';
import { searchTasks, searchComments } from '../../services/searchService.js';
import { parseQuickAdd } from '../../utils/quickAddParser.js';
import { parseFilterQuery } from '../../utils/filterParser.js';
import { ForbiddenError } from '../../errors/index.js';

// Every path that finds projects on a user's behalf (quick add's #project,
// filter #project, reorder, full-text search) against a real database, so
// they can't drift from the access rules in services/access.ts again.

const RUN = randomUUID().slice(0, 8);
const U: Record<string, string> = {};
const P: Record<string, string> = {};
// A word Postgres' English stemmer leaves alone, unique to this run.
const WORD = `zqx${RUN.replace(/[^a-z]/g, '')}marker`;

beforeAll(async () => {
  for (const name of ['me', 'teammate', 'guest', 'outsider', 'leaver']) {
    const user = await prisma.user.create({
      data: { email: `pl-${name}-${RUN}@lookup.test`, passwordHash: 'x', name: `pl-${name}`, emailVerified: true },
    });
    U[name] = user.id;
  }

  const ws = await prisma.workspace.create({
    data: {
      name: `Lookup WS ${RUN}`,
      slug: `lookup-${RUN}`,
      ownerId: U.teammate,
      members: {
        create: [
          { userId: U.teammate, role: 'OWNER' },
          { userId: U.me, role: 'MEMBER' },
          { userId: U.guest, role: 'GUEST' },
        ],
      },
    },
  });

  const project = async (key: string, data: { name: string; ownerId: string; workspaceId?: string; parentId?: string; isArchived?: boolean }) => {
    P[key] = (await prisma.project.create({ data })).id;
  };
  await project('homework', { name: `Homework ${RUN}`, ownerId: U.me });
  await project('team', { name: `Team ${RUN}`, ownerId: U.teammate, workspaceId: ws.id });
  await project('teamChild', { name: 'Launch', ownerId: U.teammate, workspaceId: ws.id, parentId: P.team });
  await project('dupPersonal', { name: `Dup ${RUN}`, ownerId: U.me });
  await project('dupTeam', { name: `dup ${RUN}`, ownerId: U.teammate, workspaceId: ws.id });
  await project('archivedMine', { name: `Old ${RUN}`, ownerId: U.me, isArchived: true });
  await project('activeTeamOld', { name: `old ${RUN}`, ownerId: U.teammate, workspaceId: ws.id });
  await project('foreign', { name: `Foreign ${RUN}`, ownerId: U.outsider });
  await project('shared', { name: `Shared ${RUN}`, ownerId: U.outsider });
  await prisma.projectMember.create({ data: { projectId: P.shared, userId: U.leaver, role: 'MEMBER' } });
  // The workspace guest sees only the team projects shared with them.
  await prisma.projectMember.createMany({
    data: [
      { projectId: P.team, userId: U.guest, role: 'COMMENTER' },
      { projectId: P.dupTeam, userId: U.guest, role: 'VIEWER' },
    ],
  });

  const task = await prisma.task.create({
    data: { content: `Plan the ${WORD}`, projectId: P.team, creatorId: U.teammate },
  });
  const sharedTask = await prisma.task.create({
    data: { content: `Secret ${WORD}`, projectId: P.shared, creatorId: U.outsider },
  });
  await prisma.comment.create({ data: { content: `Note on ${WORD}`, taskId: task.id, authorId: U.teammate } });
  await prisma.comment.create({ data: { content: `Leaver ${WORD}`, taskId: sharedTask.id, authorId: U.leaver } });
  // The leaver commented, then lost access.
  await prisma.projectMember.deleteMany({ where: { projectId: P.shared, userId: U.leaver } });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: Object.values(P) } } });
  await prisma.workspace.deleteMany({ where: { slug: `lookup-${RUN}` } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `-${RUN}@lookup.test` } } });
  await prisma.$disconnect();
});

describe('findProjectByName', () => {
  it('matches exactly, not by substring or LIKE pattern', async () => {
    expect(await findProjectByName(U.me, `work ${RUN}`)).toBeNull();
    expect(await findProjectByName(U.me, `Homework_${RUN}`)).toBeNull();
    expect(await findProjectByName(U.me, `%${RUN}`)).toBeNull();
    expect((await findProjectByName(U.me, `HOMEWORK ${RUN}`))?.id).toBe(P.homework);
  });

  it('finds workspace projects', async () => {
    expect((await findProjectByName(U.me, `Team ${RUN}`))?.id).toBe(P.team);
  });

  it('never finds projects the user cannot see', async () => {
    expect(await findProjectByName(U.me, `Foreign ${RUN}`)).toBeNull();
  });

  it('prefers the user’s own project when names collide', async () => {
    expect((await findProjectByName(U.me, `DUP ${RUN}`))?.id).toBe(P.dupPersonal);
  });

  it('prefers an active project over an archived one', async () => {
    expect((await findProjectByName(U.me, `Old ${RUN}`))?.id).toBe(P.activeTeamOld);
  });

  it('respects minLevel: a guest can see a team project shared with them, but not add to it', async () => {
    expect((await findProjectByName(U.guest, `Team ${RUN}`))?.id).toBe(P.team);
    expect(await findProjectByName(U.guest, `Team ${RUN}`, { minLevel: 'EDIT' })).toBeNull();
    // Team projects not shared with them stay hidden.
    expect(await findProjectByName(U.guest, `old ${RUN}`)).toBeNull();
  });
});

describe('quick add and filters resolve #project the same way', () => {
  it('quick add files into a workspace project by exact name', async () => {
    // "_" is not a wildcard (Prisma's insensitive equals is an unescaped ILIKE).
    const unmatched = await parseQuickAdd(`Call #Team_${RUN}`, U.me);
    expect(unmatched.projectId).toBeUndefined();
    expect(unmatched.content).toBe(`Call #Team_${RUN}`);

    await prisma.project.update({ where: { id: P.teamChild }, data: { name: `Launch${RUN}` } });
    const matched = await parseQuickAdd(`Ship it #launch${RUN}`, U.me);
    expect(matched.projectId).toBe(P.teamChild);
    expect(matched.content).toBe('Ship it');
  });

  it('filter #project finds workspace projects and ##Parent/Child walks the tree', async () => {
    expect(await parseFilterQuery(`#Launch${RUN}`, U.me)).toEqual({ projectId: P.teamChild });
    await prisma.project.update({ where: { id: P.team }, data: { name: `Team${RUN}` } });
    expect(await parseFilterQuery(`##Team${RUN}/Launch${RUN}`, U.me)).toEqual({ projectId: P.teamChild });
  });
});

describe('filter "assigned to:" only knows collaborators', () => {
  it('resolves a teammate by name', async () => {
    expect(await parseFilterQuery(`assigned to: pl-teammate`, U.me)).toEqual({ assigneeId: U.teammate });
  });

  it('does not resolve someone the user has never worked with', async () => {
    expect(await parseFilterQuery(`assigned to: pl-outsider`, U.me)).toEqual({ id: { in: [] } });
  });
});

describe('reorderProjects', () => {
  it('lets a workspace member reorder team projects', async () => {
    await expect(reorderProjects([P.dupTeam, P.team], U.me)).resolves.toBeTruthy();
  });

  it('lets a guest arrange their own view of the projects they can see', async () => {
    await expect(reorderProjects([P.dupTeam, P.team], U.guest)).resolves.toBeTruthy();
  });

  it('refuses projects the user cannot see', async () => {
    await expect(reorderProjects([P.homework, P.foreign], U.me)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('search access', () => {
  it('finds workspace tasks and comments for members', async () => {
    expect((await searchTasks(WORD, U.me)).map((t) => t.projectId)).toEqual([P.team]);
    expect((await searchComments(WORD, U.me)).map((c) => c.content)).toEqual([`Note on ${WORD}`]);
  });

  it('shows outsiders nothing from the workspace', async () => {
    expect(await searchTasks(WORD, U.outsider)).toEqual([expect.objectContaining({ projectId: P.shared })]);
  });

  it('forgets a leaver’s comments on projects they lost', async () => {
    expect(await searchComments(WORD, U.leaver)).toEqual([]);
    expect(await searchTasks(WORD, U.leaver)).toEqual([]);
  });
});
