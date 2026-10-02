import { unzipSync } from 'fflate';
import { isSupportedRecurrence } from '@taskflow/contract';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ValidationError } from '../../errors/index.js';
import { uploadFile } from '../fileService.js';
import { exportDocumentSchema, type ExportDocument, type ExportTask } from './format.js';
import { isTodoistCsv, parseSimpleCsv, parseTodoistCsv } from './csv.js';

/**
 * Imports: a Taskflow export (.zip or .json), a Todoist CSV or backup ZIP of
 * CSVs, or a plain CSV. Everything is created new, in the importer's own
 * space; nothing existing is changed.
 */

const MAX_TASKS = 20_000;
const MAX_WARNINGS = 50;

export interface ImportSummary {
  projects: number;
  sections: number;
  tasks: number;
  comments: number;
  attachments: number;
  labels: number;
  filters: number;
  warnings: string[];
}

const isZip = (buf: Buffer) => buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
const baseName = (filename: string) =>
  filename
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]+$/, '')
    // Todoist's backup names files "Project name [123456].csv".
    .replace(/\s*\[\d+\]$/, '')
    .trim() || 'Imported';

/** The ZIP's files, refusing archives that unpack to more than the limit. */
function unzip(buf: Buffer): Map<string, Uint8Array> {
  const limit = env.IMPORT_MAX_SIZE_MB * 4 * 1024 * 1024;
  let total = 0;
  const files = unzipSync(new Uint8Array(buf), {
    filter: (file) => {
      if (file.name.endsWith('/')) return false;
      total += file.originalSize;
      if (total > limit) throw new ValidationError('That archive unpacks to more than this Taskflow accepts.');
      return true;
    },
  });
  return new Map(Object.entries(files));
}

const decode = (bytes: Uint8Array) => new TextDecoder('utf-8').decode(bytes);

/** Read an uploaded file into a document to import, plus any attachment files. */
export function readImport(filename: string, buf: Buffer): { document: ExportDocument; files: Map<string, Uint8Array>; warnings: string[] } {
  const empty = new Map<string, Uint8Array>();
  const fromCsv = (name: string, text: string) => {
    const { projects, warnings } = isTodoistCsv(text) ? parseTodoistCsv(name, text) : parseSimpleCsv(name, text);
    return { projects, warnings };
  };
  const asDocument = (projects: ExportDocument['projects']): ExportDocument => ({
    format: 'taskflow-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    labels: [],
    filters: [],
    projects,
    activity: [],
  });
  const parseExport = (json: string) => {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new ValidationError('That file isn’t valid JSON.');
    }
    const result = exportDocumentSchema.safeParse(raw);
    if (!result.success) throw new ValidationError('That isn’t a Taskflow export, or it’s from a newer version.');
    return result.data;
  };

  if (isZip(buf)) {
    const files = unzip(buf);
    const exportJson = files.get('export.json');
    if (exportJson) return { document: parseExport(decode(exportJson)), files, warnings: [] };
    const csvs = [...files.entries()].filter(([name]) => name.toLowerCase().endsWith('.csv'));
    if (csvs.length === 0) throw new ValidationError('That ZIP has no Taskflow export or CSV files in it.');
    const warnings: string[] = [];
    const projects = csvs.flatMap(([name, bytes], i) => {
      const parsed = fromCsv(baseName(name), decode(bytes));
      warnings.push(...parsed.warnings);
      return parsed.projects.map((p, j) => ({ ...p, ref: `${i}-${j}` }));
    });
    return { document: asDocument(projects), files: empty, warnings };
  }

  const lower = filename.toLowerCase();
  const text = decode(buf);
  if (lower.endsWith('.json') || text.trimStart().startsWith('{')) return { document: parseExport(text), files: empty, warnings: [] };
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const { projects, warnings } = fromCsv(baseName(filename), text);
    return { document: asDocument(projects), files: empty, warnings };
  }
  throw new ValidationError('Choose a Taskflow export (.zip or .json), a Todoist CSV or backup, or a CSV file.');
}

const asDate = (day: string | null | undefined) => (day ? new Date(`${day}T00:00:00Z`) : null);
const asInstant = (value: string | null | undefined) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/** Parents before their subtasks, keeping the file's order otherwise. */
function parentsFirst(tasks: ExportTask[]): ExportTask[] {
  const refs = new Set(tasks.map((t) => t.ref));
  const done = new Set<string>();
  const ordered: ExportTask[] = [];
  let pending = tasks;
  while (pending.length) {
    const next = pending.filter((t) => t.parentRef && refs.has(t.parentRef) && !done.has(t.parentRef));
    const ready = pending.filter((t) => !next.includes(t));
    if (ready.length === 0) {
      // A cycle: import the rest as top-level tasks.
      for (const t of next) ordered.push({ ...t, parentRef: null });
      break;
    }
    for (const t of ready) {
      ordered.push(t);
      done.add(t.ref);
    }
    pending = next;
  }
  return ordered;
}

export async function applyImport(
  userId: string,
  document: ExportDocument,
  files: Map<string, Uint8Array>,
  initialWarnings: string[] = [],
): Promise<ImportSummary> {
  const taskCount = document.projects.reduce((n, p) => n + p.tasks.length, 0);
  if (taskCount > MAX_TASKS) throw new ValidationError(`That's ${taskCount} tasks; an import can have up to ${MAX_TASKS}.`);

  const summary: ImportSummary = { projects: 0, sections: 0, tasks: 0, comments: 0, attachments: 0, labels: 0, filters: 0, warnings: [...initialWarnings] };
  const warn = (message: string) => summary.warnings.length < MAX_WARNINGS && summary.warnings.push(message);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const inbox = await prisma.project.findFirst({ where: { ownerId: userId, isInbox: true }, select: { id: true } });

  // Personal labels, matched by name whatever the case.
  const labelIds = new Map(
    (await prisma.label.findMany({ where: { userId, workspaceId: null }, select: { id: true, name: true } })).map((l) => [l.name.toLowerCase(), l.id]),
  );
  const colors = new Map(document.labels.map((l) => [l.name.toLowerCase(), l.color]));
  async function labelId(name: string): Promise<string> {
    const key = name.toLowerCase();
    let id = labelIds.get(key);
    if (!id) {
      id = (await prisma.label.create({ data: { name, userId, ...(colors.get(key) && { color: colors.get(key) }) } })).id;
      labelIds.set(key, id);
      summary.labels++;
    }
    return id;
  }

  for (const filter of document.filters) {
    await prisma.filter.create({ data: { name: filter.name, query: filter.query, userId, ...(filter.color && { color: filter.color }) } });
    summary.filters++;
  }

  const projectIds = new Map<string, string>();
  const uploads: { path: string; filename: string; mimeType: string; taskId?: string; commentId?: string }[] = [];

  for (const project of document.projects) {
    const intoInbox = project.isInbox && inbox;
    const projectId = intoInbox
      ? inbox.id
      : (
          await prisma.project.create({
            data: {
              name: project.name,
              ownerId: userId,
              ...(project.color && { color: project.color }),
              description: project.description ?? null,
              ...(project.viewStyle && { viewStyle: project.viewStyle }),
              isArchived: project.isArchived,
            },
          })
        ).id;
    if (!intoInbox) summary.projects++;
    projectIds.set(project.ref, projectId);

    const sectionIds = new Map<string, string>();
    for (const [i, section] of project.sections.entries()) {
      const created = await prisma.section.create({ data: { name: section.name, projectId, sortOrder: i } });
      sectionIds.set(section.ref, created.id);
      summary.sections++;
    }

    const taskIds = new Map<string, string>();
    for (const [i, task] of parentsFirst(project.tasks).entries()) {
      let rule = task.recurrenceRule ?? null;
      if (rule && !isSupportedRecurrence(rule)) {
        warn(`"${task.content}" repeats in a way Taskflow doesn't support, so it was imported without repeating.`);
        rule = null;
      }
      const created = await prisma.task.create({
        data: {
          content: task.content,
          description: task.description ?? null,
          projectId,
          sectionId: task.sectionRef ? (sectionIds.get(task.sectionRef) ?? null) : null,
          parentId: task.parentRef ? (taskIds.get(task.parentRef) ?? null) : null,
          creatorId: userId,
          assigneeId: task.assignee && task.assignee.toLowerCase() === user.email ? userId : null,
          dueDate: asDate(task.dueDate),
          dueTime: task.dueDate ? (task.dueTime ?? null) : null,
          duration: task.duration ?? null,
          deadline: asDate(task.deadline),
          isRecurring: !!rule,
          recurrenceRule: rule,
          priority: task.priority,
          isCompleted: task.isCompleted,
          completedAt: task.isCompleted ? (asInstant(task.completedAt) ?? new Date()) : null,
          sortOrder: i,
          ...(asInstant(task.createdAt) && { createdAt: asInstant(task.createdAt)! }),
        },
      });
      taskIds.set(task.ref, created.id);
      summary.tasks++;

      const names = [...new Set(task.labels.map((l) => l.trim()).filter(Boolean))];
      if (names.length) {
        const ids = await Promise.all(names.map(labelId));
        await prisma.taskLabel.createMany({ data: ids.map((labelId) => ({ taskId: created.id, labelId })), skipDuplicates: true });
      }

      for (const comment of task.comments) {
        const byOther = comment.author && comment.author.toLowerCase() !== user.email;
        const row = await prisma.comment.create({
          data: {
            content: byOther ? `*From ${comment.author}:*\n\n${comment.content}` : comment.content,
            authorId: userId,
            taskId: created.id,
            ...(asInstant(comment.createdAt) && { createdAt: asInstant(comment.createdAt)! }),
          },
        });
        summary.comments++;
        for (const a of comment.attachments) uploads.push({ ...a, commentId: row.id });
      }
      for (const a of task.attachments) uploads.push({ ...a, taskId: created.id });
    }
  }

  // Sub-projects, once every project exists.
  for (const project of document.projects) {
    const parent = project.parentRef ? projectIds.get(project.parentRef) : undefined;
    if (parent && !project.isInbox && parent !== projectIds.get(project.ref)) {
      await prisma.project.update({ where: { id: projectIds.get(project.ref) }, data: { parentId: parent } });
    }
  }

  // Files go through the normal upload checks (type, size, content).
  for (const upload of uploads) {
    const bytes = files.get(upload.path);
    if (!bytes) {
      warn(`The file "${upload.filename}" wasn't in the export.`);
      continue;
    }
    try {
      await uploadFile(Buffer.from(bytes), upload.filename, upload.mimeType, userId, upload.taskId, upload.commentId);
      summary.attachments++;
    } catch (err) {
      warn(`"${upload.filename}" wasn't imported: ${(err as Error).message}`);
    }
  }

  logger.info({ userId, ...summary, warnings: summary.warnings.length }, 'import finished');
  return summary;
}

export async function importFile(userId: string, filename: string, buf: Buffer): Promise<ImportSummary> {
  const { document, files, warnings } = readImport(filename, buf);
  if (document.projects.length === 0 && document.filters.length === 0) {
    throw new ValidationError('There was nothing to import in that file.');
  }
  return applyImport(userId, document, files, warnings);
}
