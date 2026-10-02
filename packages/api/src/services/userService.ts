import { prisma, type DbTransaction } from '../config/database.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../errors/index.js';
import { disconnectUserSockets } from '../websocket/events.js';
import { deleteObjects } from '../config/storage.js';
import type { DateFormat, SystemRole, Theme, TimeFormat } from '@prisma/client';
import { logger } from '../config/logger.js';

/**
 * Creates an account together with its Inbox, in the user's own space (no
 * workspace; workspaces are for teams). Callers supply the transaction
 * client — a user without an Inbox permanently breaks quick-add ("No default
 * project found"), so both rows land or neither does.
 *
 * Shared by self-service registration and admin-created accounts so the two
 * provisioning paths cannot drift apart.
 */
export async function provisionUser(
  tx: DbTransaction,
  data: {
    email: string;
    passwordHash: string;
    /** False for single sign-on accounts, whose passwordHash is a random placeholder. */
    passwordSet?: boolean;
    name: string;
    emailVerified: boolean;
    role?: SystemRole;
    emailVerifyToken?: string | null;
    emailVerifyTokenExpiresAt?: Date | null;
    preferences?: { timezone?: string; weekStart?: number; dateFormat?: DateFormat; timeFormat?: TimeFormat };
  },
) {
  const created = await tx.user.create({
    data: {
      email: data.email,
      passwordHash: data.passwordHash,
      ...(data.passwordSet === false ? { passwordSet: false } : {}),
      name: data.name,
      emailVerified: data.emailVerified,
      emailVerifyToken: data.emailVerifyToken ?? null,
      emailVerifyTokenExpiresAt: data.emailVerifyTokenExpiresAt ?? null,
      ...data.preferences,
      // Omitted rather than defaulted so the column default applies and the
      // self-service path's insert shape is unchanged.
      ...(data.role ? { role: data.role } : {}),
    },
  });

  await tx.project.create({
    data: {
      name: 'Inbox',
      ownerId: created.id,
      isInbox: true,
    },
  });

  return created;
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      timezone: true,
      weekStart: true,
      dateFormat: true,
      timeFormat: true,
      theme: true,
      // The web app hides the admin console unless the signed-in user is one.
      role: true,
      isActive: true,
      emailVerified: true,
      passwordSet: true,
      createdAt: true,
      updatedAt: true,
      workspaceMemberships: {
        select: {
          role: true,
          workspace: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return user;
}

export async function updateUser(
  id: string,
  data: {
    name?: string;
    avatarUrl?: string | null;
    timezone?: string;
    weekStart?: number;
    dateFormat?: DateFormat | null;
    timeFormat?: TimeFormat | null;
    theme?: Theme | null;
  },
) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new NotFoundError('User not found');
  }

  return prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      timezone: true,
      weekStart: true,
      dateFormat: true,
      timeFormat: true,
      theme: true,
      role: true,
      isActive: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/** Throws unless `password` is the user's current password. */
export async function confirmPassword(id: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: { passwordHash: true, passwordSet: true } });
  if (user && !user.passwordSet) {
    throw new ForbiddenError('Set a password first, in Settings → Account.', 'PASSWORD_NOT_SET');
  }
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    // 403, not 401: a 401 would make clients think their session expired.
    throw new ForbiddenError('That password isn’t right');
  }
}

/** How recently a single sign-on account must have signed in to choose its first password. */
const FIRST_PASSWORD_WINDOW_MS = 15 * 60_000;

export async function changePassword(
  id: string,
  currentPassword: string | undefined,
  newPassword: string,
  sessionId?: string,
) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.passwordSet) {
    const valid = !!currentPassword && (await verifyPassword(currentPassword, user.passwordHash));
    if (!valid) {
      throw new UnauthorizedError('Current password is incorrect');
    }
  } else {
    // A single sign-on account has no password to confirm with, so it must
    // have just signed in instead.
    const session = sessionId
      ? await prisma.refreshToken.findFirst({ where: { userId: id, sessionId }, select: { sessionStartedAt: true } })
      : null;
    if (!session || Date.now() - session.sessionStartedAt.getTime() > FIRST_PASSWORD_WINDOW_MS) {
      throw new ForbiddenError(
        'Sign out and sign in again with single sign-on, then set your password within 15 minutes.',
        'REAUTH_REQUIRED',
      );
    }
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id },
    data: { passwordHash, passwordSet: true },
  });

  // Invalidate all refresh tokens and kill live sockets — anything holding
  // the old credentials must be forced to re-authenticate.
  await prisma.refreshToken.deleteMany({ where: { userId: id } });
  disconnectUserSockets(id);

  return { message: 'Password changed successfully' };
}

export async function deleteUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Workspaces this user owns, and whether anyone else is a member of them.
  const ownedWorkspaces = await prisma.workspace.findMany({
    where: { ownerId: id },
    select: {
      id: true,
      name: true,
      members: {
        where: { userId: { not: id } },
        select: { userId: true },
        take: 1,
      },
    },
  });

  // A workspace with other members is the team's data, not the leaver's —
  // deleting the account must not take it down. Ownership has to move first.
  const sharedWorkspaces = ownedWorkspaces.filter((w) => w.members.length > 0);
  if (sharedWorkspaces.length > 0) {
    const names = sharedWorkspaces.map((w) => `"${w.name}"`).join(', ');
    throw new ConflictError(
      `You still own shared workspace(s) with other members: ${names}. ` +
        'Transfer ownership (or remove all members) before deleting your account.',
    );
  }

  // Collect the object-storage keys BEFORE the delete, because the rows that
  // hold them do not survive it and the orphan sweep can only find rows.
  //
  // Two different cascades destroy the evidence. Attachment.uploadedBy cascades,
  // so everything this user uploaded — anywhere, including in other people's
  // projects — is deleted outright rather than left orphaned. And deleting their
  // workspaces cascades through projects and tasks, taking attachments OTHER
  // people uploaded there with them. Either way the row is gone and the bytes
  // are unreachable but still billed and still copied into every backup.
  // Their own space (Inbox and personal projects) goes with them. The owner
  // relation is SetNull, so without this those projects were left behind
  // with no owner and no workspace: unreachable, but still stored.
  const personalProjects = { ownerId: id, workspaceId: null };
  const doomedAttachments = await prisma.attachment.findMany({
    where: {
      OR: [
        { uploadedById: id },
        { task: { project: personalProjects } },
        { comment: { task: { project: personalProjects } } },
        ...(ownedWorkspaces.length > 0
          ? [
              {
                task: {
                  project: { workspaceId: { in: ownedWorkspaces.map((w) => w.id) } },
                },
              },
              {
                comment: {
                  task: {
                    project: {
                      workspaceId: { in: ownedWorkspaces.map((w) => w.id) },
                    },
                  },
                },
              },
            ]
          : []),
      ],
    },
    select: { url: true },
  });

  // Sole-member workspaces and their own space are the user's own data —
  // remove them explicitly, then the account. Tasks the user created in
  // OTHER people's projects survive with creatorId set to null (schema), and
  // the DB-level Restrict on workspace ownership backstops this logic.
  await prisma.$transaction(async (tx) => {
    for (const workspace of ownedWorkspaces) {
      await tx.workspace.delete({ where: { id: workspace.id } });
    }
    await tx.project.deleteMany({ where: personalProjects });
    await tx.user.delete({ where: { id } });
  });

  // After the rows are gone: a failure here leaks bytes, whereas deleting the
  // objects first would destroy live attachments if the transaction rolled back.
  if (doomedAttachments.length > 0) {
    try {
      await deleteObjects(doomedAttachments.map((a) => a.url));
    } catch (err) {
      logger.error(
        { err, userId: id, objects: doomedAttachments.length },
        'account deleted, but its storage objects could not be removed',
      );
    }
  }

  return { message: 'Account deleted successfully' };
}

export async function exportUserData(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      timezone: true,
      weekStart: true,
      dateFormat: true,
      timeFormat: true,
      theme: true,
      createdAt: true,
    },
  });
  if (!user) throw new NotFoundError('User not found');

  const [tasks, projects, comments, labels, filters, activityLogs] = await Promise.all([
    prisma.task.findMany({
      where: { creatorId: id },
      select: {
        id: true, content: true, description: true, priority: true,
        isCompleted: true, dueDate: true, createdAt: true,
        project: { select: { name: true } },
      },
    }),
    prisma.project.findMany({
      where: { ownerId: id },
      select: { id: true, name: true, color: true, createdAt: true },
    }),
    prisma.comment.findMany({
      where: { authorId: id },
      select: { id: true, content: true, taskId: true, createdAt: true },
    }),
    prisma.label.findMany({
      where: { userId: id },
      select: { id: true, name: true, color: true },
    }),
    prisma.filter.findMany({
      where: { userId: id },
      select: { id: true, name: true, query: true },
    }),
    prisma.activityLog.findMany({
      where: { userId: id },
      select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    user,
    tasks,
    projects,
    comments,
    labels,
    filters,
    activityLogs,
  };
}
