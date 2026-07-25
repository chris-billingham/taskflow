import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database.js', () => ({
  prisma: {
    attachment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    task: { findUnique: vi.fn() },
    comment: { findUnique: vi.fn() },
    projectMember: { findUnique: vi.fn() },
    workspaceMember: { findUnique: vi.fn() },
  },
}));

vi.mock('../../config/storage.js', () => ({
  uploadObject: vi.fn(),
  deleteObject: vi.fn(),
  getObjectStream: vi.fn(),
}));

vi.mock('../../config/env.js', () => ({
  env: { MAX_FILE_SIZE_MB: 25 },
}));

import { prisma } from '../../config/database.js';
import { uploadObject, getObjectStream } from '../../config/storage.js';
import * as fileService from '../../services/fileService.js';
import { contentDisposition } from '../../routes/attachments.js';

const mockPrisma = prisma as unknown as Record<
  string,
  Record<string, ReturnType<typeof vi.fn>>
>;
const mockUploadObject = uploadObject as unknown as ReturnType<typeof vi.fn>;
const mockGetObjectStream = getObjectStream as unknown as ReturnType<typeof vi.fn>;

const USER_ID = 'user-1';

// Real magic bytes so file-type sniffing runs against genuine signatures.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG_HEADER = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.from('JFIF\0', 'ascii'),
  Buffer.alloc(64),
]);
const PDF_DOC = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const PLAIN_TEXT = Buffer.from('meeting notes\n- follow up on the Q3 numbers\n');

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.attachment.create.mockImplementation(
    ({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'att-1', ...data, uploadedBy: { id: USER_ID } }),
  );
});

describe('uploadFile content validation', () => {
  it('rejects MIME types outside the allowlist', async () => {
    await expect(
      fileService.uploadFile(PLAIN_TEXT, 'x.html', 'text/html', USER_ID),
    ).rejects.toThrow(/not allowed/);
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it('rejects files over the size limit', async () => {
    const big = Buffer.alloc(26 * 1024 * 1024);
    await expect(
      fileService.uploadFile(big, 'big.txt', 'text/plain', USER_ID),
    ).rejects.toThrow(/size limit/);
  });

  it('rejects binary content smuggled under a text label', async () => {
    await expect(
      fileService.uploadFile(PNG_1PX, 'notes.txt', 'text/plain', USER_ID),
    ).rejects.toThrow(/does not match the declared type/);
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it('rejects content whose signature contradicts the declared type', async () => {
    await expect(
      fileService.uploadFile(JPEG_HEADER, 'img.png', 'image/png', USER_ID),
    ).rejects.toThrow(/does not match the declared type/);
  });

  it('rejects signatureless content declared as a binary type', async () => {
    await expect(
      fileService.uploadFile(PLAIN_TEXT, 'img.png', 'image/png', USER_ID),
    ).rejects.toThrow(/does not match the declared type/);
  });

  it('accepts a PNG declared as image/png', async () => {
    const result = await fileService.uploadFile(PNG_1PX, '1px.png', 'image/png', USER_ID);
    expect(mockUploadObject).toHaveBeenCalledTimes(1);
    expect(result.mimeType).toBe('image/png');
    // Object keys must be server-generated, never the client filename.
    const key = mockUploadObject.mock.calls[0][0] as string;
    expect(key).toMatch(new RegExp(`^attachments/${USER_ID}/[0-9a-f-]{36}\\.png$`));
  });

  it('accepts a PDF declared as application/pdf', async () => {
    await expect(
      fileService.uploadFile(PDF_DOC, 'doc.pdf', 'application/pdf', USER_ID),
    ).resolves.toBeTruthy();
  });

  it('accepts plain text declared as text/plain', async () => {
    await expect(
      fileService.uploadFile(PLAIN_TEXT, 'notes.txt', 'text/plain', USER_ID),
    ).resolves.toBeTruthy();
  });
});

describe('getDownloadStream access control', () => {
  it('404s for a missing attachment', async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue(null);
    await expect(fileService.getDownloadStream('nope', USER_ID)).rejects.toThrow(
      /not found/i,
    );
  });

  it('denies an unattached file to anyone but its uploader', async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue({
      id: 'att-1',
      taskId: null,
      commentId: null,
      uploadedById: 'someone-else',
      url: 'attachments/x/y.png',
    });
    await expect(fileService.getDownloadStream('att-1', USER_ID)).rejects.toThrow(
      /access/i,
    );
    expect(mockGetObjectStream).not.toHaveBeenCalled();
  });

  it('streams a task attachment to a project member', async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue({
      id: 'att-1',
      taskId: 'task-1',
      commentId: null,
      uploadedById: 'someone-else',
      url: 'attachments/x/y.png',
      filename: 'y.png',
      mimeType: 'image/png',
    });
    mockPrisma.task.findUnique.mockResolvedValue({
      id: 'task-1',
      creatorId: 'someone-else',
      projectId: 'p1',
      project: { ownerId: USER_ID, workspaceId: null },
    });
    mockGetObjectStream.mockResolvedValue({ body: 'stream', contentLength: 42 });

    const result = await fileService.getDownloadStream('att-1', USER_ID);
    expect(result.body).toBe('stream');
    expect(result.contentLength).toBe(42);
    expect(result.attachment.filename).toBe('y.png');
  });
});

describe('contentDisposition', () => {
  it('forces attachment with both fallback and RFC 5987 filenames', () => {
    expect(contentDisposition('report.pdf', false)).toBe(
      `attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`,
    );
  });

  it('permits inline when requested', () => {
    expect(contentDisposition('photo.png', true)).toMatch(/^inline; /);
  });

  it('neutralises header-breaking characters in the fallback name', () => {
    const header = contentDisposition('ev"il\r\nname.txt', false);
    const fallback = header.match(/filename="([^"]*)"/)?.[1] ?? '';
    expect(fallback).not.toMatch(/["\r\n\\]/);
  });

  it('encodes non-ASCII filenames', () => {
    const header = contentDisposition('café notes.txt', false);
    expect(header).toContain(`filename*=UTF-8''caf%C3%A9%20notes.txt`);
    expect(header).toContain('filename="caf_ notes.txt"');
  });
});
