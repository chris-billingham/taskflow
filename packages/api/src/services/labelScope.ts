import type { Prisma } from '@prisma/client';
import { prisma, type DbTransaction } from '../config/database.js';
import { ValidationError } from '../errors/index.js';

// Labels belong to a space: a person's own (userId) or a workspace's
// (workspaceId). A project's tasks use the labels of the project's space: the
// workspace's team labels, or for a personal project its owner's labels (also
// when the project is shared with others).

export type LabelScope = { workspaceId: string } | { userId: string };

type Db = DbTransaction | typeof prisma;

export function scopeOfProject(project: { workspaceId: string | null; ownerId: string | null }): LabelScope | null {
  if (project.workspaceId) return { workspaceId: project.workspaceId };
  if (project.ownerId) return { userId: project.ownerId };
  return null;
}

export async function projectLabelScope(projectId: string, db: Db = prisma): Promise<LabelScope | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true, ownerId: true },
  });
  return project ? scopeOfProject(project) : null;
}

export function scopeWhere(scope: LabelScope): Prisma.LabelWhereInput {
  return 'workspaceId' in scope ? { workspaceId: scope.workspaceId } : { userId: scope.userId };
}

export function sameScope(a: LabelScope | null, b: LabelScope | null): boolean {
  if (!a || !b) return false;
  if ('workspaceId' in a) return 'workspaceId' in b && a.workspaceId === b.workspaceId;
  return 'userId' in b && a.userId === b.userId;
}

/** Every label must belong to the project's space. */
export async function assertLabelsInScope(labelIds: string[], scope: LabelScope | null, db: Db = prisma) {
  if (labelIds.length === 0) return;
  const unique = [...new Set(labelIds)];
  const found = scope
    ? await db.label.count({ where: { id: { in: unique }, ...scopeWhere(scope) } })
    : 0;
  if (found !== unique.length) {
    throw new ValidationError("A task can only use labels from its project's space");
  }
}

/**
 * Label ids in `scope` for these names, matched case-insensitively. With
 * `create`, names the space doesn't have yet become new labels (keeping the
 * colour given for them); otherwise they're left out.
 */
export async function labelIdsByName(
  scope: LabelScope,
  wanted: { name: string; color?: string }[],
  options: { create?: boolean } = {},
  db: Db = prisma,
): Promise<Map<string, string>> {
  const byLower = new Map<string, string>();
  if (wanted.length === 0) return byLower;
  // A space's labels are few; match names in code (Prisma's insensitive mode
  // doesn't apply to `in` filters).
  const wantedKeys = new Set(wanted.map((w) => w.name.toLowerCase()));
  const existing = await db.label.findMany({
    where: scopeWhere(scope),
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const label of existing) {
    const key = label.name.toLowerCase();
    if (wantedKeys.has(key) && !byLower.has(key)) byLower.set(key, label.id);
  }
  if (!options.create) return byLower;

  const missing = new Map<string, { name: string; color?: string }>();
  for (const w of wanted) {
    const key = w.name.toLowerCase();
    if (!byLower.has(key) && !missing.has(key)) missing.set(key, w);
  }
  if (missing.size === 0) return byLower;
  const max = await db.label.aggregate({ where: scopeWhere(scope), _max: { sortOrder: true } });
  let next = (max._max.sortOrder ?? 0) + 1;
  for (const [key, w] of missing) {
    const created = await db.label.create({
      data: { name: w.name, color: w.color ?? '#6B7280', sortOrder: next++, ...scope },
      select: { id: true },
    });
    byLower.set(key, created.id);
  }
  return byLower;
}

/**
 * The same labels, by name, in another space: used when a task moves to a
 * project in a different space. Names the destination lacks are created
 * there, so moving never silently loses a label.
 */
export async function mapLabelsToScope(labelIds: string[], to: LabelScope, db: Db = prisma): Promise<string[]> {
  if (labelIds.length === 0) return [];
  const labels = await db.label.findMany({
    where: { id: { in: labelIds } },
    select: { name: true, color: true },
  });
  const ids = await labelIdsByName(to, labels, { create: true }, db);
  return [...new Set(labels.map((l) => ids.get(l.name.toLowerCase())!))];
}

/** Re-home a set of tasks' labels into `to` (after a move between spaces). */
export async function remapTaskLabels(taskIds: string[], to: LabelScope | null, db: Db = prisma) {
  if (!to || taskIds.length === 0) return;
  // Filtered in code: `NOT { workspaceId: x }` in SQL also drops every row
  // whose workspaceId is NULL (all personal labels).
  const all = await db.taskLabel.findMany({
    where: { taskId: { in: taskIds } },
    select: { taskId: true, labelId: true, label: { select: { userId: true, workspaceId: true } } },
  });
  const links = all.filter(
    (l) => !sameScope(l.label.workspaceId ? { workspaceId: l.label.workspaceId } : { userId: l.label.userId! }, to),
  );
  if (links.length === 0) return;
  const mapped = new Map<string, string>();
  for (const id of new Set(links.map((l) => l.labelId))) {
    const [target] = await mapLabelsToScope([id], to, db);
    mapped.set(id, target);
  }
  await db.taskLabel.deleteMany({
    where: { OR: links.map((l) => ({ taskId: l.taskId, labelId: l.labelId })) },
  });
  await db.taskLabel.createMany({
    data: links.map((l) => ({ taskId: l.taskId, labelId: mapped.get(l.labelId)! })),
    skipDuplicates: true,
  });
}
