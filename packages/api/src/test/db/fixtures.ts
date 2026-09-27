import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/database.js';
import type { WorkspaceRole } from '@prisma/client';

/**
 * Per-file fixtures for DB tests: every row is tagged with a run id so files
 * can share one database and clean up only what they made.
 */
export function dbFixtures(prefix: string) {
  const run = randomUUID().slice(0, 8);
  const domain = `${prefix}-${run}.test`;
  const workspaceSlugs: string[] = [];

  return {
    run,
    async user(name: string) {
      return prisma.user.create({
        data: { email: `${name}@${domain}`, passwordHash: 'x', name, emailVerified: true },
      });
    },
    async workspace(ownerId: string, members: Record<string, WorkspaceRole> = {}) {
      const slug = `${prefix}-${run}-${workspaceSlugs.length}`;
      workspaceSlugs.push(slug);
      return prisma.workspace.create({
        data: {
          name: `WS ${slug}`,
          slug,
          ownerId,
          members: {
            create: [
              { userId: ownerId, role: 'OWNER' },
              ...Object.entries(members).map(([userId, role]) => ({ userId, role })),
            ],
          },
        },
      });
    },
    async cleanup() {
      await prisma.workspace.deleteMany({ where: { slug: { in: workspaceSlugs } } });
      await prisma.user.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
    },
  };
}
