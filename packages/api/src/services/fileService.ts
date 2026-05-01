import { randomUUID } from 'crypto';
import { extname } from 'path';
import { prisma } from '../config/database.js';
import { uploadObject, deleteObject, createPresignedUrl } from '../config/storage.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors/index.js';
import { ALLOWED_MIME_TYPES } from '../schemas/attachment.js';
import { env } from '../config/env.js';

const uploaderSelect = {
  id: true,
  name: true,
  avatarUrl: true,
};

async function verifyTaskAccess(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { ownerId: true, workspaceId: true } } },
  });
  if (!task) throw new NotFoundError('Task not found');
  if (task.project.ownerId !== userId && task.creatorId !== userId) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: task.projectId, userId } },
    });
    if (!member) {
      if (task.project.workspaceId) {
        const wsMember = await prisma.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId: task.project.workspaceId, userId } },
        });
        if (wsMember) return task;
      }
      throw new ForbiddenError('You do not have access to this task');
    }
  }
  return task;
}

async function verifyCommentAccess(commentId: string, userId: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: {
      task: { include: { project: { select: { ownerId: true, id: true, workspaceId: true } } } },
    },
  });
  if (!comment) throw new NotFoundError('Comment not found');
  if (comment.task) {
    const task = comment.task;
    if (task.project.ownerId !== userId && task.creatorId !== userId) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: task.projectId, userId } },
      });
      if (!member) {
        if (task.project.workspaceId) {
          const wsMember = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId: task.project.workspaceId, userId } },
          });
          if (wsMember) return comment;
        }
        throw new ForbiddenError('You do not have access to this comment');
      }
    }
  }
  return comment;
}

export async function uploadFile(
  fileBuffer: Buffer,
  originalFilename: string,
  mimeType: string,
  userId: string,
  taskId?: string,
  commentId?: string,
) {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ValidationError(`File type "${mimeType}" is not allowed`);
  }

  const maxBytes = env.MAX_FILE_SIZE_MB * 1024 * 1024;
  if (fileBuffer.length > maxBytes) {
    throw new ValidationError(`File exceeds the ${env.MAX_FILE_SIZE_MB}MB size limit`);
  }

  if (taskId) await verifyTaskAccess(taskId, userId);
  if (commentId) await verifyCommentAccess(commentId, userId);

  const ext = extname(originalFilename) || '';
  const key = `attachments/${userId}/${randomUUID()}${ext}`;

  await uploadObject(key, fileBuffer, mimeType);

  const attachment = await prisma.attachment.create({
    data: {
      filename: originalFilename,
      mimeType,
      size: fileBuffer.length,
      url: key,
      uploadedById: userId,
      taskId: taskId ?? null,
      commentId: commentId ?? null,
    },
    include: { uploadedBy: { select: uploaderSelect } },
  });

  const signedUrl = await createPresignedUrl(key);
  return { ...attachment, signedUrl };
}

export async function getTaskAttachments(taskId: string, userId: string) {
  await verifyTaskAccess(taskId, userId);

  const attachments = await prisma.attachment.findMany({
    where: { taskId },
    include: { uploadedBy: { select: uploaderSelect } },
    orderBy: { createdAt: 'desc' },
  });

  return Promise.all(
    attachments.map(async (a) => ({
      ...a,
      signedUrl: await createPresignedUrl(a.url),
    })),
  );
}

export async function getCommentAttachments(commentId: string, userId: string) {
  await verifyCommentAccess(commentId, userId);

  const attachments = await prisma.attachment.findMany({
    where: { commentId },
    include: { uploadedBy: { select: uploaderSelect } },
    orderBy: { createdAt: 'desc' },
  });

  return Promise.all(
    attachments.map(async (a) => ({
      ...a,
      signedUrl: await createPresignedUrl(a.url),
    })),
  );
}

export async function getSignedDownloadUrl(id: string, userId: string) {
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) throw new NotFoundError('Attachment not found');

  // Verify user has access via task or comment
  if (attachment.taskId) {
    await verifyTaskAccess(attachment.taskId, userId);
  } else if (attachment.commentId) {
    await verifyCommentAccess(attachment.commentId, userId);
  } else if (attachment.uploadedById !== userId) {
    throw new ForbiddenError('You do not have access to this attachment');
  }

  return createPresignedUrl(attachment.url);
}

export async function deleteFile(id: string, userId: string) {
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) throw new NotFoundError('Attachment not found');

  // Only uploader can delete
  if (attachment.uploadedById !== userId) {
    throw new ForbiddenError('You can only delete your own attachments');
  }

  await deleteObject(attachment.url);
  await prisma.attachment.delete({ where: { id } });

  return { message: 'Attachment deleted successfully' };
}
