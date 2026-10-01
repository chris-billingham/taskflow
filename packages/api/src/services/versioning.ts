import type { DbTransaction } from '../config/database.js';
import { ConflictError, VersionConflictError } from '../errors/index.js';
import { Prisma } from '@prisma/client';

type VersionedTable = 'tasks' | 'projects' | 'sections' | 'labels';

/**
 * Inside a transaction, before changing a row: if the client said which
 * version it last saw, lock the row and refuse the change when it has moved
 * on since. The lock holds until the transaction ends, so nobody can slip a
 * change in between the check and this update. `current` builds the row to
 * send back in the 409.
 */
export async function assertVersion(
  tx: DbTransaction,
  table: VersionedTable,
  id: string,
  ifVersion: number | undefined,
  current: () => Promise<unknown>,
) {
  if (ifVersion === undefined) return;
  const rows = await tx.$queryRawUnsafe<{ version: number }[]>(
    `SELECT "version" FROM "${table}" WHERE "id" = $1 FOR UPDATE`,
    id,
  );
  if (rows[0] && rows[0].version !== ifVersion) {
    throw new VersionConflictError(await current());
  }
}

/**
 * Create with a client-chosen id, idempotently. If a row with that id already
 * exists and `isSame` says it's the caller's own earlier attempt, return it
 * (an offline retry); otherwise the id is someone else's, which is a 409.
 * Without an id, just create.
 */
export async function createOnce<T>(
  id: string | undefined,
  existing: () => Promise<T | null>,
  isSame: (row: T) => boolean,
  create: () => Promise<T>,
): Promise<{ row: T; created: boolean }> {
  if (id) {
    const found = await existing();
    if (found) {
      if (isSame(found)) return { row: found, created: false };
      throw new ConflictError('That id is already in use');
    }
  }
  try {
    return { row: await create(), created: true };
  } catch (err) {
    // Two retries raced past the lookup: the loser returns the winner's row.
    if (id && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const found = await existing();
      if (found && isSame(found)) return { row: found, created: false };
      throw new ConflictError('That id is already in use');
    }
    throw err;
  }
}
