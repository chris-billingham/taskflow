import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../errors/index.js';
import type { ProjectRole } from '@prisma/client';

export async function checkProjectAccess(
  userId: string,
  projectId: string,
  requiredRole?: ProjectRole,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Owner always has full access
  if (project.ownerId === userId) {
    return true;
  }

  // Check membership
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });

  if (!member) {
    throw new ForbiddenError('You do not have access to this project');
  }

  // If a specific role is required, check it
  if (requiredRole) {
    const roleHierarchy: Record<ProjectRole, number> = {
      ADMIN: 4,
      MEMBER: 3,
      COMMENTER: 2,
      VIEWER: 1,
    };

    if (roleHierarchy[member.role] < roleHierarchy[requiredRole]) {
      throw new ForbiddenError('Insufficient permissions for this action');
    }
  }

  return true;
}
