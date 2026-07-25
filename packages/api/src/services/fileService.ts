import { randomUUID } from 'crypto';
import { extname } from 'path';
import { fileTypeFromBuffer } from 'file-type';
import { prisma } from '../config/database.js';
import { uploadObject, deleteObject, getObjectStream } from '../config/storage.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors/index.js';
import { ALLOWED_MIME_TYPES } from '../schemas/attachment.js';
import { env } from '../config/env.js';

// The client-declared MIME type is untrusted. For declared types whose real
// format carries a magic-byte signature, the sniffed type must be compatible;
// for text-like declared types (which have no signature) the content must NOT
// sniff as some known binary format. This blocks e.g. an executable or HTML
// smuggled under an allowed label.
const SNIFF_COMPATIBLE: Record<string, string[]> = {
  'image/jpeg': ['image/jpeg'],
  'image/jpg': ['image/jpeg'],
  'image/png': ['image/png'],
  'image/gif': ['image/gif'],
  'image/webp': ['image/webp'],
  'application/pdf': ['application/pdf'],
  // OOXML formats are zip containers; file-type usually identifies the precise
  // type but can fall back to plain zip for some writers.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
  ],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
  ],
  // Legacy Office formats are OLE compound files.
  'application/msword': ['application/x-cfb'],
  'application/vnd.ms-excel': ['application/x-cfb'],
  'application/vnd.ms-powerpoint': ['application/x-cfb'],
  'application/zip': ['application/zip'],
  'application/x-zip-compressed': ['application/zip'],
  'application/x-tar': ['application/x-tar'],
  'application/gzip': ['application/gzip'],
};

async function assertContentMatchesDeclaredType(
  buffer: Buffer,
  declaredMime: string,
): Promise<void> {
  const sniffed = await fileTypeFromBuffer(buffer);
  const compatible = SNIFF_COMPATIBLE[declaredMime];

  if (compatible) {
    if (!sniffed || !compatible.includes(sniffed.mime)) {
      throw new ValidationError(
        `File content does not match the declared type "${declaredMime}"`,
      );
    }
    return;
  }

  // Text-like declared type (text/*, application/json): signatureless content
  // is expected — a recognised binary signature means the label is a lie.
  if (sniffed) {
    throw new ValidationError(
      `File content does not match the declared type "${declaredMime}"`,
    );
  }
}

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

  await assertContentMatchesDeclaredType(fileBuffer, mimeType);

  if (taskId) await verifyTaskAccess(taskId, userId);
  if (commentId) await verifyCommentAccess(commentId, userId);

  const ext = extname(originalFilename) || '';
  const key = `attachments/${userId}/${randomUUID()}${ext}`;

  await uploadObject(key, fileBuffer, mimeType);

  return prisma.attachment.create({
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
}

export async function getTaskAttachments(taskId: string, userId: string) {
  await verifyTaskAccess(taskId, userId);

  return prisma.attachment.findMany({
    where: { taskId },
    include: { uploadedBy: { select: uploaderSelect } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getCommentAttachments(commentId: string, userId: string) {
  await verifyCommentAccess(commentId, userId);

  return prisma.attachment.findMany({
    where: { commentId },
    include: { uploadedBy: { select: uploaderSelect } },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Access-checked download. Returns the attachment row plus the S3 body stream
 * for the route to pipe to the client — browsers can't reach the S3 endpoint
 * directly (internal hostname), and proxying lets us force download semantics
 * on untrusted content.
 */
export async function getDownloadStream(id: string, userId: string) {
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

  const { body, contentLength } = await getObjectStream(attachment.url);
  if (!body) throw new NotFoundError('Attachment content not found');

  return { attachment, body, contentLength };
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
