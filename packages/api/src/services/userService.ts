import { prisma } from '../config/database.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { ConflictError, NotFoundError, UnauthorizedError } from '../errors/index.js';

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
      emailVerified: true,
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
    dateFormat?: string | null;
    timeFormat?: string | null;
    theme?: string | null;
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
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function changePassword(
  id: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id },
    data: { passwordHash },
  });

  // Invalidate all refresh tokens
  await prisma.refreshToken.deleteMany({ where: { userId: id } });

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

  // Sole-member workspaces (including the personal one) are the user's own
  // data — remove them explicitly, then the account. Tasks the user created
  // in OTHER people's projects survive with creatorId set to null (schema),
  // and the DB-level Restrict on workspace ownership backstops this logic.
  await prisma.$transaction(async (tx) => {
    for (const workspace of ownedWorkspaces) {
      await tx.workspace.delete({ where: { id: workspace.id } });
    }
    await tx.user.delete({ where: { id } });
  });

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
      select: { id: true, content: true, taskId: true, projectId: true, createdAt: true },
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
