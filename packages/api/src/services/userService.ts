import { prisma } from '../config/database.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { NotFoundError, UnauthorizedError } from '../errors/index.js';

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

  await prisma.user.delete({ where: { id } });

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
