import { randomBytes } from 'crypto';
import { prisma } from '../config/database.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../errors/index.js';
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  InviteMemberInput,
  UpdateMemberInput,
} from '../schemas/workspace.js';
import { logActivity } from './activityService.js';
import { isMailerReady, sendWorkspaceInviteEmail } from './mailService.js';
import { getIO } from '../websocket/events.js';

function generateSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') +
    '-' +
    randomBytes(4).toString('hex')
  );
}

function generateInviteToken(): string {
  return randomBytes(32).toString('hex');
}

const memberInclude = {
  user: {
    select: { id: true, name: true, email: true, avatarUrl: true },
  },
};

async function verifyWorkspaceMembership(
  workspaceId: string,
  userId: string,
) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) {
    throw new ForbiddenError('You are not a member of this workspace');
  }
  return member;
}

async function verifyWorkspaceAdmin(workspaceId: string, userId: string) {
  const member = await verifyWorkspaceMembership(workspaceId, userId);
  if (member.role !== 'OWNER' && member.role !== 'ADMIN') {
    throw new ForbiddenError('Admin access required');
  }
  return member;
}

async function verifyWorkspaceOwner(workspaceId: string, userId: string) {
  const member = await verifyWorkspaceMembership(workspaceId, userId);
  if (member.role !== 'OWNER') {
    throw new ForbiddenError('Owner access required');
  }
  return member;
}

export async function getUserWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        include: {
          _count: {
            select: { members: true, projects: true },
          },
        },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  return memberships.map((m) => ({
    ...m.workspace,
    role: m.role,
  }));
}

export async function getWorkspaceById(id: string, userId: string) {
  await verifyWorkspaceMembership(id, userId);

  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: {
      owner: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
      members: {
        include: memberInclude,
        orderBy: { joinedAt: 'asc' },
      },
      _count: {
        select: { members: true, projects: true },
      },
    },
  });

  if (!workspace) {
    throw new NotFoundError('Workspace not found');
  }

  return workspace;
}

export async function createWorkspace(
  data: CreateWorkspaceInput,
  userId: string,
) {
  const slug = generateSlug(data.name);

  const workspace = await prisma.workspace.create({
    data: {
      name: data.name,
      slug,
      description: data.description,
      ownerId: userId,
      members: {
        create: {
          userId,
          role: 'OWNER',
        },
      },
    },
    include: {
      members: { include: memberInclude },
      _count: {
        select: { members: true, projects: true },
      },
    },
  });

  logActivity({
    action: 'CREATED',
    entityType: 'WORKSPACE',
    entityId: workspace.id,
    userId,
    newData: { name: data.name },
  }).catch(console.error);

  return { ...workspace, role: 'OWNER' as const };
}

export async function updateWorkspace(
  id: string,
  data: UpdateWorkspaceInput,
  userId: string,
) {
  await verifyWorkspaceAdmin(id, userId);

  const workspace = await prisma.workspace.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
    },
    include: {
      _count: {
        select: { members: true, projects: true },
      },
    },
  });

  logActivity({
    action: 'UPDATED',
    entityType: 'WORKSPACE',
    entityId: id,
    userId,
    newData: data as Record<string, unknown>,
  }).catch(console.error);

  return workspace;
}

export async function deleteWorkspace(id: string, userId: string) {
  await verifyWorkspaceOwner(id, userId);

  await prisma.workspace.delete({ where: { id } });

  logActivity({
    action: 'DELETED',
    entityType: 'WORKSPACE',
    entityId: id,
    userId,
  }).catch(console.error);

  return { message: 'Workspace deleted successfully' };
}

export async function getWorkspaceMembers(id: string, userId: string) {
  await verifyWorkspaceMembership(id, userId);

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: id },
    include: memberInclude,
    orderBy: { joinedAt: 'asc' },
  });

  return members;
}

export async function inviteMember(
  workspaceId: string,
  data: InviteMemberInput,
  userId: string,
) {
  await verifyWorkspaceAdmin(workspaceId, userId);

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true },
  });
  if (!workspace) {
    throw new NotFoundError('Workspace not found');
  }

  // Check if user is already a member
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });

  if (existingUser) {
    const existingMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId: existingUser.id },
      },
    });
    if (existingMember) {
      throw new ConflictError('User is already a member of this workspace');
    }
  }

  // Check for existing pending invite
  const existingInvite = await prisma.workspaceInvite.findFirst({
    where: {
      workspaceId,
      email: data.email,
      expiresAt: { gt: new Date() },
    },
  });
  if (existingInvite) {
    throw new ConflictError('An invite has already been sent to this email');
  }

  const token = generateInviteToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 day expiry

  const invite = await prisma.workspaceInvite.create({
    data: {
      workspaceId,
      email: data.email,
      role: data.role,
      token,
      expiresAt,
    },
  });

  if (isMailerReady()) {
    const inviter = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    // Fire-and-forget: the invite link also remains visible in the members UI,
    // so a dropped email is recoverable.
    void sendWorkspaceInviteEmail(
      invite.email,
      inviter?.name ?? 'A teammate',
      workspace.name,
      invite.token,
    ).catch((err) => {
      console.error(
        '[mail] workspace invite email failed:',
        err instanceof Error ? err.message : err,
      );
    });
  }

  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    token: invite.token,
    expiresAt: invite.expiresAt,
  };
}

export async function acceptInvite(token: string, userId: string) {
  const invite = await prisma.workspaceInvite.findUnique({
    where: { token },
    include: {
      workspace: { select: { id: true, name: true } },
    },
  });

  if (!invite) {
    throw new NotFoundError('Invalid invite token');
  }

  if (invite.expiresAt < new Date()) {
    await prisma.workspaceInvite.delete({ where: { id: invite.id } });
    throw new ForbiddenError('Invite has expired');
  }

  // Check if already a member
  const existing = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId: invite.workspaceId, userId },
    },
  });
  if (existing) {
    await prisma.workspaceInvite.delete({ where: { id: invite.id } });
    throw new ConflictError('You are already a member of this workspace');
  }

  // Add as member and delete invite in a transaction
  const [member] = await prisma.$transaction([
    prisma.workspaceMember.create({
      data: {
        workspaceId: invite.workspaceId,
        userId,
        role: invite.role,
      },
      include: {
        workspace: {
          include: {
            _count: { select: { members: true, projects: true } },
          },
        },
      },
    }),
    prisma.workspaceInvite.delete({ where: { id: invite.id } }),
  ]);

  return {
    workspace: { ...member.workspace, role: invite.role },
  };
}

export async function updateMemberRole(
  workspaceId: string,
  memberId: string,
  data: UpdateMemberInput,
  userId: string,
) {
  await verifyWorkspaceAdmin(workspaceId, userId);

  // Can't change owner's role
  const targetMember = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: memberId } },
  });

  if (!targetMember) {
    throw new NotFoundError('Member not found in this workspace');
  }
  if (targetMember.role === 'OWNER') {
    throw new ForbiddenError('Cannot change the owner\'s role');
  }

  // Only owner can promote to admin
  if (data.role === 'ADMIN') {
    await verifyWorkspaceOwner(workspaceId, userId);
  }

  const member = await prisma.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId, userId: memberId } },
    data: { role: data.role },
    include: memberInclude,
  });

  return member;
}


/**
 * A membership row is not just a grant — projects the leaver OWNS inside the
 * workspace are the team's working data. Reassign them to the workspace owner
 * so they stay owned by someone with access, then drop the membership, all in
 * one transaction. Finally kick the leaver's live sockets out of the
 * workspace's realtime rooms (room membership is a read grant that would
 * otherwise persist until they reconnect).
 */
async function revokeMembership(workspaceId: string, memberId: string) {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { ownerId: true },
  });

  const ownedProjects = await prisma.project.findMany({
    where: { workspaceId, ownerId: memberId },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    if (ownedProjects.length > 0) {
      await tx.project.updateMany({
        where: { id: { in: ownedProjects.map((p) => p.id) } },
        data: { ownerId: workspace.ownerId },
      });
    }
    // Direct project memberships inside this workspace go too.
    await tx.projectMember.deleteMany({
      where: { userId: memberId, project: { workspaceId } },
    });
    await tx.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: memberId } },
    });
  });

  // Evict live sockets from the rooms this membership granted.
  const io = getIO();
  if (io) {
    const projectIds = await prisma.project.findMany({
      where: { workspaceId },
      select: { id: true },
    });
    io.in(`user:${memberId}`).socketsLeave([
      `workspace:${workspaceId}`,
      ...projectIds.map((p) => `project:${p.id}`),
    ]);
  }
}

export async function removeMember(
  workspaceId: string,
  memberId: string,
  userId: string,
) {
  await verifyWorkspaceAdmin(workspaceId, userId);

  const targetMember = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: memberId } },
  });

  if (!targetMember) {
    throw new NotFoundError('Member not found in this workspace');
  }
  if (targetMember.role === 'OWNER') {
    throw new ForbiddenError('Cannot remove the workspace owner');
  }

  await revokeMembership(workspaceId, memberId);

  return { message: 'Member removed successfully' };
}

export async function leaveWorkspace(workspaceId: string, userId: string) {
  const member = await verifyWorkspaceMembership(workspaceId, userId);

  if (member.role === 'OWNER') {
    throw new ForbiddenError(
      'Owner cannot leave the workspace. Transfer ownership first.',
    );
  }

  await revokeMembership(workspaceId, userId);

  return { message: 'Left workspace successfully' };
}

export async function transferOwnership(
  workspaceId: string,
  newOwnerId: string,
  userId: string,
) {
  await verifyWorkspaceOwner(workspaceId, userId);

  const newOwnerMember = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: newOwnerId } },
  });

  if (!newOwnerMember) {
    throw new NotFoundError('New owner must be a member of the workspace');
  }

  await prisma.$transaction([
    // Update workspace owner
    prisma.workspace.update({
      where: { id: workspaceId },
      data: { ownerId: newOwnerId },
    }),
    // Set new owner's role to OWNER
    prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: newOwnerId } },
      data: { role: 'OWNER' },
    }),
    // Demote current owner to ADMIN
    prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId } },
      data: { role: 'ADMIN' },
    }),
  ]);

  return { message: 'Ownership transferred successfully' };
}

export async function getPendingInvites(workspaceId: string, userId: string) {
  await verifyWorkspaceAdmin(workspaceId, userId);

  return prisma.workspaceInvite.findMany({
    where: {
      workspaceId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function resendInvite(
  workspaceId: string,
  inviteId: string,
  userId: string,
) {
  await verifyWorkspaceAdmin(workspaceId, userId);

  const invite = await prisma.workspaceInvite.findUnique({
    where: { id: inviteId },
  });

  if (!invite || invite.workspaceId !== workspaceId) {
    throw new NotFoundError('Invite not found');
  }

  const token = generateInviteToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const updated = await prisma.workspaceInvite.update({
    where: { id: inviteId },
    data: { token, expiresAt },
  });

  return {
    id: updated.id,
    email: updated.email,
    role: updated.role,
    token: updated.token,
    expiresAt: updated.expiresAt,
    createdAt: updated.createdAt,
  };
}

export async function cancelInvite(
  workspaceId: string,
  inviteId: string,
  userId: string,
) {
  await verifyWorkspaceAdmin(workspaceId, userId);

  const invite = await prisma.workspaceInvite.findUnique({
    where: { id: inviteId },
  });

  if (!invite || invite.workspaceId !== workspaceId) {
    throw new NotFoundError('Invite not found');
  }

  await prisma.workspaceInvite.delete({ where: { id: inviteId } });

  return { message: 'Invite cancelled successfully' };
}
