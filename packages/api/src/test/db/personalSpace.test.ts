import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import { deleteUser, provisionUser } from '../../services/userService.js';
import { dbFixtures } from './fixtures.js';

const fx = dbFixtures('personalspace');
afterAll(async () => {
  await fx.cleanup();
  await prisma.$disconnect();
});

describe('personal space', () => {
  it('a new account gets an Inbox in its own space, and no workspace', async () => {
    const user = await prisma.$transaction((tx) =>
      provisionUser(tx, {
        email: `new-${fx.run}@personalspace-${fx.run}.test`,
        passwordHash: 'x',
        name: 'New',
        emailVerified: true,
      }),
    );
    const projects = await prisma.project.findMany({ where: { ownerId: user.id } });
    expect(projects).toEqual([expect.objectContaining({ name: 'Inbox', isInbox: true, workspaceId: null })]);
    expect(await prisma.workspaceMember.count({ where: { userId: user.id } })).toBe(0);
  });

  it('deleting an account removes its own space, but not team projects it created', async () => {
    const leaver = await fx.user('leaver');
    const teammate = await fx.user('teammate');
    const ws = await fx.workspace(teammate.id, { [leaver.id]: 'MEMBER' });
    const inbox = await prisma.project.create({ data: { name: 'Inbox', ownerId: leaver.id, isInbox: true } });
    const garden = await prisma.project.create({ data: { name: 'Garden', ownerId: leaver.id } });
    await prisma.task.create({ data: { content: 'Water tomatoes', projectId: garden.id, creatorId: leaver.id } });
    const team = await prisma.project.create({ data: { name: 'Launch', ownerId: leaver.id, workspaceId: ws.id } });

    await deleteUser(leaver.id);

    expect(await prisma.project.count({ where: { id: { in: [inbox.id, garden.id] } } })).toBe(0);
    expect(await prisma.task.count({ where: { projectId: garden.id, deletedAt: undefined } })).toBe(0);
    expect(await prisma.project.findUnique({ where: { id: team.id } })).toMatchObject({ ownerId: null, workspaceId: ws.id });
  });
});
