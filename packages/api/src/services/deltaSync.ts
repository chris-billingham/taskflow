import type { Prisma } from '@prisma/client';
import { prisma, type DbTransaction } from '../config/database.js';
import { projectAccessWhere, taskAccessWhere } from './access.js';
import { scopeOfProject, scopeWhere, type LabelScope } from './labelScope.js';
import { asSeenBy, settingsFor } from './labelService.js';
import {
  projectSettingsInclude,
  sectionSettingsInclude,
  withProjectSettings,
  withSectionSettings,
} from './userSettings.js';

// GET /sync. Every synced row carries the id of the transaction that last
// wrote it (syncTxid, set by triggers). A sync runs in one REPEATABLE READ
// snapshot and returns rows with syncTxid >= the client's cursor; the new
// cursor is the snapshot's xmin, the oldest transaction still running when it
// was taken. Everything older was finished and is in this snapshot, and
// anything newer that wasn't visible yet has a txid >= the new cursor, so the
// next sync picks it up. Rows may arrive twice; clients upsert by id.

/** Completed tasks older than this aren't in a full sync (deltas still carry changes to them). */
const FULL_SYNC_COMPLETED_DAYS = 30;
/** Instance setting holding the oldest cursor tombstones still cover. */
export const SYNC_FLOOR_KEY = 'sync_floor';

const taskSelect = {
  taskLabels: { select: { labelId: true } },
} satisfies Prisma.TaskInclude;

export async function sync(userId: string, since?: string) {
  return prisma.$transaction(
    async (tx) => {
      const [{ xmin }] = await tx.$queryRaw<{ xmin: bigint }[]>`
        SELECT txid_snapshot_xmin(txid_current_snapshot()) AS xmin`;
      const floor = await tx.instanceSetting.findUnique({ where: { key: SYNC_FLOOR_KEY } });
      // Tombstones before the floor are gone: an older cursor can't be
      // brought up to date, so the client starts again.
      const reset = since !== undefined && floor !== null && BigInt(since) < BigInt(floor.value);
      const from = since === undefined || reset ? null : BigInt(since);

      const payload = from === null ? await fullSync(tx, userId) : await deltaSync(tx, userId, from);
      return { cursor: xmin.toString(), reset, ...payload };
    },
    { isolationLevel: 'RepeatableRead', timeout: 30_000 },
  );
}

async function visibleProjects(tx: DbTransaction, userId: string) {
  return tx.project.findMany({
    where: projectAccessWhere(userId),
    select: { id: true, ownerId: true, workspaceId: true },
  });
}

/** Every space whose labels this person may see on a task. */
async function labelScopes(tx: DbTransaction, userId: string, projects: { ownerId: string | null; workspaceId: string | null }[]) {
  const scopes: LabelScope[] = [{ userId }];
  const memberships = await tx.workspaceMember.findMany({
    where: { userId, role: { not: 'GUEST' } },
    select: { workspaceId: true },
  });
  for (const m of memberships) scopes.push({ workspaceId: m.workspaceId });
  for (const p of projects) {
    const scope = scopeOfProject(p);
    if (scope) scopes.push(scope);
  }
  return scopes;
}

const labelsIn = (scopes: LabelScope[]): Prisma.LabelWhereInput => ({ OR: scopes.map(scopeWhere) });

function shapeTask(task: Omit<Prisma.TaskGetPayload<{ include: typeof taskSelect }>, 'syncTxid'>) {
  const { taskLabels, ...fields } = task;
  return { ...fields, labelIds: taskLabels.map((tl) => tl.labelId) };
}

async function fullSync(tx: DbTransaction, userId: string) {
  const projects = await visibleProjects(tx, userId);
  const projectIds = projects.map((p) => p.id);
  const completedSince = new Date(Date.now() - FULL_SYNC_COMPLETED_DAYS * 86_400_000);

  const [projectRows, sections, tasks, labels] = await Promise.all([
    tx.project.findMany({ where: { id: { in: projectIds } }, include: projectSettingsInclude(userId) }),
    tx.section.findMany({ where: { projectId: { in: projectIds } }, include: sectionSettingsInclude(userId) }),
    tx.task.findMany({
      where: {
        AND: [taskAccessWhere(userId), { OR: [{ isCompleted: false }, { completedAt: { gte: completedSince } }] }],
      },
      include: taskSelect,
    }),
    tx.label.findMany({ where: labelsIn(await labelScopes(tx, userId, projects)), include: settingsFor(userId) }),
  ]);

  return {
    projectIds,
    projects: projectRows.map((p) => withProjectSettings(p)),
    sections: sections.map((s) => withSectionSettings(s)),
    tasks: tasks.map(shapeTask),
    labels: labels.map(asSeenBy),
    deleted: { projects: [], sections: [], tasks: [], labels: [] },
  };
}

async function deltaSync(tx: DbTransaction, userId: string, from: bigint) {
  const changed = { syncTxid: { gte: from } };
  const projects = await visibleProjects(tx, userId);
  const projectIds = projects.map((p) => p.id);

  // Projects that became visible since the cursor (shared with you, or you
  // joined their workspace): their rows may be old, so they come whole.
  const gained = await tx.project.findMany({
    where: {
      id: { in: projectIds },
      OR: [
        { members: { some: { userId, ...changed } } },
        { workspace: { members: { some: { userId, ...changed } } } },
      ],
    },
    select: { id: true, ownerId: true, workspaceId: true },
  });
  const gainedIds = gained.map((p) => p.id);
  const scopes = await labelScopes(tx, userId, projects);
  const gainedScopes = gained.map(scopeOfProject).filter((s): s is LabelScope => s !== null);

  const [projectRows, sections, tasks, labels, tombstones] = await Promise.all([
    tx.project.findMany({
      where: {
        id: { in: projectIds },
        OR: [changed, { id: { in: gainedIds } }, { userSettings: { some: { userId, ...changed } } }],
      },
      include: projectSettingsInclude(userId),
    }),
    tx.section.findMany({
      where: {
        projectId: { in: projectIds },
        OR: [changed, { projectId: { in: gainedIds } }, { userSettings: { some: { userId, ...changed } } }],
      },
      include: sectionSettingsInclude(userId),
    }),
    tx.task.findMany({
      // Trashed tasks too: the client needs to know they went.
      where: { AND: [taskAccessWhere(userId), { OR: [changed, { projectId: { in: gainedIds } }] }], deletedAt: undefined },
      include: taskSelect,
    }),
    tx.label.findMany({
      where: {
        AND: [
          labelsIn(scopes),
          {
            OR: [
              changed,
              { userSettings: { some: { userId, ...changed } } },
              ...(gainedScopes.length ? [labelsIn(gainedScopes)] : []),
            ],
          },
        ],
      },
      include: settingsFor(userId),
    }),
    tx.syncTombstone.findMany({ where: changed, select: { entityType: true, entityId: true } }),
  ]);

  const deleted = { projects: [] as string[], sections: [] as string[], tasks: [] as string[], labels: [] as string[] };
  for (const t of tombstones) {
    const list = deleted[`${t.entityType}s` as keyof typeof deleted];
    if (list) list.push(t.entityId);
  }

  return {
    projectIds,
    projects: projectRows.map((p) => withProjectSettings(p)),
    sections: sections.map((s) => withSectionSettings(s)),
    tasks: tasks.map(shapeTask),
    labels: labels.map(asSeenBy),
    deleted,
  };
}

/**
 * Drop tombstones older than `days`, and raise the floor so a client whose
 * cursor predates them knows to start again. Run by the maintenance job.
 */
export async function pruneTombstones(days = 90) {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const newest = await prisma.syncTombstone.aggregate({ where: { deletedAt: { lt: cutoff } }, _max: { syncTxid: true } });
  if (newest._max.syncTxid === null) return 0;
  const floor = (newest._max.syncTxid + 1n).toString();
  const { count } = await prisma.syncTombstone.deleteMany({ where: { syncTxid: { lte: newest._max.syncTxid } } });
  await prisma.instanceSetting.upsert({
    where: { key: SYNC_FLOOR_KEY },
    create: { key: SYNC_FLOOR_KEY, value: floor },
    update: { value: floor },
  });
  return count;
}
