import { randomUUID } from 'crypto';
import { extname } from 'path';
import { fileTypeFromBuffer } from 'file-type';
import { prisma } from '../config/database.js';
import { uploadObject, deleteObject, deleteObjects, getObjectStream } from '../config/storage.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors/index.js';
import {
  requireTaskAccess,
  requireProjectAccess,
  type AccessLevel,
} from './access.js';
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

/**
 * Comments live on a task OR directly on a project (schema supports both).
 * The previous check only handled the task shape — a project-scoped comment
 * fell through with NO access check at all.
 */
async function requireCommentAccess(
  commentId: string,
  userId: string,
  level: AccessLevel,
) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, taskId: true, projectId: true, authorId: true },
  });
  if (!comment) throw new NotFoundError('Comment not found');
  if (comment.taskId) {
    await requireTaskAccess(comment.taskId, userId, level);
  } else if (comment.projectId) {
    await requireProjectAccess(comment.projectId, userId, level);
  } else if (comment.authorId !== userId) {
    throw new ForbiddenError('You do not have access to this comment');
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

  if (taskId) await requireTaskAccess(taskId, userId, 'EDIT');
  if (commentId) await requireCommentAccess(commentId, userId, 'COMMENT');

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
  await requireTaskAccess(taskId, userId, 'VIEW');

  return prisma.attachment.findMany({
    where: { taskId },
    include: { uploadedBy: { select: uploaderSelect } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getCommentAttachments(commentId: string, userId: string) {
  await requireCommentAccess(commentId, userId, 'VIEW');

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
    await requireTaskAccess(attachment.taskId, userId, 'VIEW');
  } else if (attachment.commentId) {
    await requireCommentAccess(attachment.commentId, userId, 'VIEW');
  } else if (attachment.uploadedById !== userId) {
    throw new ForbiddenError('You do not have access to this attachment');
  }

  const { body, contentLength } = await getObjectStream(attachment.url);
  if (!body) throw new NotFoundError('Attachment content not found');

  return { attachment, body, contentLength };
}

/**
 * Delete an attachment. The uploader always may; otherwise it takes ADMIN on the
 * project the attachment hangs off.
 *
 * Uploader-only left project admins unable to clean up anything a colleague had
 * attached — including a file uploaded to the wrong place, or by someone who has
 * since left — with no route to it in the app at all.
 */
export async function deleteFile(id: string, userId: string) {
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) throw new NotFoundError('Attachment not found');

  if (attachment.uploadedById !== userId) {
    if (attachment.taskId) {
      await requireTaskAccess(attachment.taskId, userId, 'ADMIN');
    } else if (attachment.commentId) {
      await requireCommentAccess(attachment.commentId, userId, 'ADMIN');
    } else {
      // Attached to nothing: there is no project whose admin could claim it, so
      // the uploader is the only person with a right to it.
      throw new ForbiddenError('You can only delete your own attachments');
    }
  }

  await deleteObject(attachment.url);
  await prisma.attachment.delete({ where: { id } });

  return { message: 'Attachment deleted successfully' };
}

/**
 * Delete the given attachment rows AND their object-storage bytes. Called
 * after task/project deletion (the FKs SetNull, so without this every delete
 * leaked orphaned rows plus unreachable objects that grew MinIO forever —
 * and were faithfully mirrored into every backup).
 */
export async function reclaimAttachments(
  attachments: Array<{ id: string; url: string }>,
): Promise<void> {
  if (attachments.length === 0) return;
  await deleteObjects(attachments.map((a) => a.url));
  await prisma.attachment.deleteMany({
    where: { id: { in: attachments.map((a) => a.id) } },
  });
}

/** Sweep rows orphaned by cascades (both FKs null) plus their objects. */
export async function sweepOrphanedAttachments(): Promise<number> {
  const orphans = await prisma.attachment.findMany({
    where: {
      taskId: null,
      commentId: null,
      // grace period: uploads are linked at creation, so anything unlinked
      // for an hour is genuinely orphaned
      createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) },
    },
    select: { id: true, url: true },
    take: 1000,
  });
  await reclaimAttachments(orphans);
  return orphans.length;
}
