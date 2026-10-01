import type { Label as LabelRow } from '@prisma/client';

/** A label as queries return it (the sync stamp is omitted globally). */
type Label = Omit<LabelRow, 'syncTxid'>;
import { prisma } from '../config/database.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors/index.js';
import type { CreateLabelInput, UpdateLabelInput } from '@taskflow/contract';
import { requireProjectAccess, requireWorkspaceRole } from './access.js';
import { projectLabelScope, scopeOfProject, scopeWhere, type LabelScope } from './labelScope.js';
import { assertVersion, createOnce } from './versioning.js';

// Labels live in a space (yours, or a workspace's). Anyone in a workspace
// except guests can add, rename and delete its team labels; favourites and
// order are each person's own (label_user_settings).

/** Sorts after anything a person has placed themselves, in the default order. */
const UNPLACED = 1_000_000;

export const settingsFor = (userId: string) => ({
  userSettings: { where: { userId }, select: { isFavorite: true, sortOrder: true } },
});

type LabelWithSettings = Label & { userSettings?: { isFavorite: boolean; sortOrder: number | null }[] };

export function asSeenBy(label: LabelWithSettings) {
  const { userSettings, ...rest } = label;
  const own = userSettings?.[0];
  return {
    ...rest,
    isFavorite: own?.isFavorite ?? false,
    sortOrder: own?.sortOrder ?? UNPLACED + label.sortOrder,
  };
}

/**
 * Your labels and your workspaces' team labels; or, with a project, the
 * labels that project's tasks can use (which may be the owner's, for a
 * personal project shared with you).
 */
export async function getLabels(userId: string, options: { projectId?: string } = {}) {
  if (options.projectId) {
    await requireProjectAccess(options.projectId, userId, 'VIEW');
    const scope = await projectLabelScope(options.projectId);
    if (!scope) return [];
    const labels = await prisma.label.findMany({
      where: scopeWhere(scope),
      include: settingsFor(userId),
    });
    return inYourOrder(labels.map(asSeenBy));
  }

  const labels = await prisma.label.findMany({
    where: {
      OR: [
        { userId },
        // Guests see only the projects shared with them; they get those
        // projects' labels through the projectId form.
        { workspace: { members: { some: { userId, role: { not: 'GUEST' } } } } },
      ],
    },
    include: settingsFor(userId),
  });
  return inYourOrder(labels.map(asSeenBy));
}

const inYourOrder = <T extends { sortOrder: number; createdAt: Date }>(labels: T[]) =>
  labels.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());

/**
 * Label names are unique within a space regardless of case: quick add's
 * @name and the filter @name match case-insensitively, so "Urgent" and
 * "urgent" side by side would be indistinguishable there.
 */
async function assertNameFree(scope: LabelScope, name: string, exceptId?: string) {
  const sameName = await prisma.label.findMany({
    where: { ...scopeWhere(scope), name: { equals: name, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  // Insensitive equals is an unescaped ILIKE; compare exactly here.
  if (sameName.some((l) => l.id !== exceptId && l.name.toLowerCase() === name.toLowerCase())) {
    throw new ConflictError('A label with this name already exists');
  }
}

async function scopeForNewLabel(data: CreateLabelInput, userId: string): Promise<LabelScope> {
  if (data.workspaceId) {
    await requireWorkspaceRole(data.workspaceId, userId, 'MEMBER');
    return { workspaceId: data.workspaceId };
  }
  if (data.projectId) {
    const project = await requireProjectAccess(data.projectId, userId, 'EDIT');
    const scope = scopeOfProject(project);
    if (!scope) throw new NotFoundError('Project not found');
    return scope;
  }
  return { userId };
}

export async function createLabel(data: CreateLabelInput, userId: string) {
  const scope = await scopeForNewLabel(data, userId);
  const sameSpace = (row: Label) =>
    'workspaceId' in scope ? row.workspaceId === scope.workspaceId : row.userId === scope.userId;
  // A retried create comes back before the name check would refuse it.
  if (data.id) {
    const earlier = await prisma.label.findUnique({ where: { id: data.id }, include: settingsFor(userId) });
    if (earlier && sameSpace(earlier)) return asSeenBy(earlier);
  }
  await assertNameFree(scope, data.name);

  const maxSort = await prisma.label.aggregate({ where: scopeWhere(scope), _max: { sortOrder: true } });
  const { row: label } = await createOnce(
    data.id,
    () => prisma.label.findUnique({ where: { id: data.id }, include: settingsFor(userId) }),
    sameSpace,
    () =>
      prisma.label.create({
    data: {
      ...(data.id && { id: data.id }),
      name: data.name,
      color: data.color ?? '#6B7280',
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      ...scope,
    },
    include: settingsFor(userId),
  }),
  );
  return asSeenBy(label);
}

/** Whether you see this label in your own list (and may arrange it). */
async function canSee(label: Label, userId: string) {
  if (label.userId) return label.userId === userId;
  return (
    (await prisma.workspaceMember.count({ where: { workspaceId: label.workspaceId!, userId } })) > 0
  );
}

/** Whether you may rename, recolour or delete it. */
async function canManage(label: Label, userId: string) {
  if (label.userId) return label.userId === userId;
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: label.workspaceId!, userId } },
    select: { role: true },
  });
  return !!member && member.role !== 'GUEST';
}

async function findLabel(id: string) {
  const label = await prisma.label.findUnique({ where: { id } });
  if (!label) throw new NotFoundError('Label not found');
  return label;
}

export async function updateLabel(id: string, data: UpdateLabelInput, userId: string) {
  const label = await findLabel(id);
  const { isFavorite, sortOrder, ifVersion, ...shared } = data;
  const changesShared = Object.values(shared).some((v) => v !== undefined);

  if (!(await canSee(label, userId))) throw new ForbiddenError('You do not have access to this label');
  if (changesShared && !(await canManage(label, userId))) {
    throw new ForbiddenError('You cannot change this label');
  }

  if (isFavorite !== undefined || sortOrder !== undefined) {
    await prisma.labelUserSetting.upsert({
      where: { userId_labelId: { userId, labelId: id } },
      create: { userId, labelId: id, isFavorite, sortOrder },
      update: { isFavorite, sortOrder },
    });
  }
  if (shared.name && shared.name !== label.name) {
    await assertNameFree(label.workspaceId ? { workspaceId: label.workspaceId } : { userId: label.userId! }, shared.name, id);
  }

  const updated = changesShared
    ? await prisma.$transaction(async (tx) => {
        await assertVersion(tx, 'labels', id, ifVersion, async () =>
          asSeenBy(await tx.label.findUniqueOrThrow({ where: { id }, include: settingsFor(userId) })),
        );
        return tx.label.update({ where: { id }, data: shared, include: settingsFor(userId) });
      })
    : await prisma.label.findUniqueOrThrow({ where: { id }, include: settingsFor(userId) });
  return asSeenBy(updated);
}

export async function deleteLabel(id: string, userId: string) {
  const label = await findLabel(id);
  if (!(await canManage(label, userId))) throw new ForbiddenError('You cannot delete this label');

  // Task links and everyone's settings for it go with it (cascade).
  await prisma.label.delete({ where: { id } });
  return { message: 'Label deleted successfully' };
}

export async function reorderLabels(labelIds: string[], userId: string) {
  if (labelIds.length === 0) return { message: 'Nothing to reorder' };

  const labels = await prisma.label.findMany({ where: { id: { in: labelIds } } });
  if (labels.length !== new Set(labelIds).size) {
    throw new NotFoundError('One or more labels not found');
  }
  for (const label of labels) {
    if (!(await canSee(label, userId))) throw new ForbiddenError('You do not have access to all of these labels');
  }

  await prisma.$transaction(
    labelIds.map((labelId, index) =>
      prisma.labelUserSetting.upsert({
        where: { userId_labelId: { userId, labelId } },
        create: { userId, labelId, sortOrder: index },
        update: { sortOrder: index },
      }),
    ),
  );

  return { message: 'Labels reordered successfully' };
}
