import { PassThrough, type Readable } from 'node:stream';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { prisma } from '../../config/database.js';
import { getObjectStream } from '../../config/storage.js';
import { logger } from '../../config/logger.js';
import type { ExportAttachment, ExportDocument } from './format.js';

/**
 * Everything you own, in the Taskflow export format: your projects (with
 * sections, tasks, recurrence, labels, comments and attachments), your
 * labels and your filters.
 */

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const iso = (d: Date | null) => (d ? d.toISOString() : null);
/** Safe inside a ZIP path: no separators, reserved or control characters. */
// eslint-disable-next-line no-control-regex
const safeName = (name: string) => name.replace(/[/\\:*?"<>|\x00-\x1f]+/g, '_').slice(0, 150) || 'file';

interface FileRef {
  path: string;
  key: string;
}

export async function buildExport(userId: string): Promise<{ document: ExportDocument; files: FileRef[] }> {
  const attachmentSelect = { id: true, filename: true, mimeType: true, size: true, url: true } as const;
  const [projects, labels, filters, activity] = await Promise.all([
    prisma.project.findMany({
      where: { ownerId: userId },
      orderBy: [{ isInbox: 'desc' }, { createdAt: 'asc' }],
      include: {
        sections: { orderBy: { sortOrder: 'asc' } },
        tasks: {
          // The automatic trash filter doesn't reach nested reads.
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          include: {
            taskLabels: { include: { label: { select: { name: true } } } },
            assignee: { select: { email: true } },
            attachments: { select: attachmentSelect },
            comments: {
              orderBy: { createdAt: 'asc' },
              include: { author: { select: { email: true } }, attachments: { select: attachmentSelect } },
            },
          },
        },
      },
    }),
    prisma.label.findMany({ where: { userId, workspaceId: null }, orderBy: { name: 'asc' } }),
    prisma.filter.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } }),
    prisma.activityLog.findMany({
      where: { userId },
      select: { action: true, entityType: true, entityId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
  ]);

  const files: FileRef[] = [];
  const attach = (a: { id: string; filename: string; mimeType: string; size: number; url: string }): ExportAttachment => {
    const path = `attachments/${a.id}/${safeName(a.filename)}`;
    files.push({ path, key: a.url });
    return { filename: a.filename, mimeType: a.mimeType, size: a.size, path };
  };

  const document: ExportDocument = {
    format: 'taskflow-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    labels: labels.map((l) => ({ name: l.name, color: l.color })),
    filters: filters.map((f) => ({ name: f.name, query: f.query, color: f.color })),
    projects: projects.map((p) => ({
      ref: p.id,
      name: p.name,
      color: p.color,
      description: p.description,
      viewStyle: p.viewStyle,
      isArchived: p.isArchived,
      isInbox: p.isInbox,
      parentRef: p.parentId,
      sections: p.sections.map((s) => ({ ref: s.id, name: s.name })),
      tasks: p.tasks.map((t) => ({
        ref: t.id,
        content: t.content,
        description: t.description,
        sectionRef: t.sectionId,
        parentRef: t.parentId,
        dueDate: day(t.dueDate),
        dueTime: t.dueTime,
        duration: t.duration,
        deadline: day(t.deadline),
        recurrenceRule: t.isRecurring ? t.recurrenceRule : null,
        priority: t.priority,
        isCompleted: t.isCompleted,
        completedAt: iso(t.completedAt),
        labels: t.taskLabels.map((tl) => tl.label.name),
        assignee: t.assignee?.email ?? null,
        createdAt: t.createdAt.toISOString(),
        comments: t.comments.map((c) => ({
          content: c.content,
          author: c.author.email,
          createdAt: c.createdAt.toISOString(),
          attachments: c.attachments.map(attach),
        })),
        attachments: t.attachments.map(attach),
      })),
    })),
    activity: activity.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
  };
  return { document, files };
}

// Already-compressed formats are stored rather than deflated again.
const STORED = /^(image\/(jpeg|png|gif|webp)|video\/|audio\/|application\/(zip|gzip|pdf))/;

/** The export as a streamed ZIP: export.json plus every attachment's file. */
export async function exportZipStream(userId: string): Promise<Readable> {
  const { document, files } = await buildExport(userId);
  const mimeByPath = new Map<string, string>();
  for (const p of document.projects)
    for (const t of p.tasks) for (const a of [...t.attachments, ...t.comments.flatMap((c) => c.attachments)]) mimeByPath.set(a.path, a.mimeType);

  const out = new PassThrough();
  const zip = new Zip((err, chunk, final) => {
    if (err) {
      out.destroy(err);
      return;
    }
    out.write(Buffer.from(chunk));
    if (final) out.end();
  });

  void (async () => {
    try {
      const json = new ZipDeflate('export.json', { level: 6 });
      zip.add(json);
      json.push(new TextEncoder().encode(JSON.stringify(document, null, 2)), true);

      for (const file of files) {
        const entry = STORED.test(mimeByPath.get(file.path) ?? '') ? new ZipPassThrough(file.path) : new ZipDeflate(file.path, { level: 6 });
        zip.add(entry);
        try {
          const { body } = await getObjectStream(file.key);
          for await (const chunk of body as AsyncIterable<Uint8Array>) entry.push(chunk);
        } catch (err) {
          logger.warn({ err, key: file.key }, 'export: attachment file missing from storage');
        }
        entry.push(new Uint8Array(0), true);
      }
      zip.end();
    } catch (err) {
      out.destroy(err as Error);
    }
  })();

  return out;
}
