import { parse } from 'csv-parse/sync';
import { parseQuickAddText } from '@taskflow/contract';
import type { ExportProject, ExportTask } from './format.js';

/**
 * CSV imports, turned into projects in the export format: Todoist's CSV
 * (a project export or template), and a plain CSV with one task per row.
 */

export interface CsvResult {
  projects: ExportProject[];
  warnings: string[];
}

function rows(text: string): Record<string, string>[] {
  return parse(text.replace(/^\uFEFF/, ''), {
    columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });
}

/** Todoist's CSV starts with TYPE,CONTENT,… */
export function isTodoistCsv(text: string): boolean {
  return /^\uFEFF?"?TYPE"?\s*,\s*"?CONTENT"?/i.test(text);
}

/** A natural-language or ISO date ("every monday", "Oct 5 2026 9am", "2026-10-05"), read like Quick Add reads it. */
function readDate(value: string, today: Date) {
  const trimmed = value.trim();
  if (!trimmed) return {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { dueDate: trimmed };
  const parsed = parseQuickAddText(`x ${trimmed}`, today);
  return { dueDate: parsed.dueDate, dueTime: parsed.dueTime, recurrenceRule: parsed.recurrenceRule };
}

/** Todoist writes labels into the content as @name. */
function splitLabels(content: string): { content: string; labels: string[] } {
  const labels: string[] = [];
  const rest = content.replace(/(^|\s)@([^\s@]+)/g, (_, lead: string, name: string) => {
    labels.push(name);
    return lead;
  });
  return { content: rest.replace(/\s{2,}/g, ' ').trim(), labels };
}

export function parseTodoistCsv(projectName: string, text: string, today = new Date()): CsvResult {
  const warnings: string[] = [];
  const project: ExportProject = { ref: 'p', name: projectName, isArchived: false, isInbox: false, sections: [], tasks: [] };
  let section: string | null = null;
  // The latest task at each indent, for subtasks and for comments.
  const byIndent: ExportTask[] = [];
  let n = 0;

  for (const row of rows(text)) {
    const type = (row.type ?? '').toLowerCase();
    const content = row.content ?? '';
    if (type === 'meta') {
      if (content === 'view_style' && /board/i.test(row.description ?? '')) project.viewStyle = 'BOARD';
      continue;
    }
    if (type === 'section') {
      section = `s${project.sections.length}`;
      project.sections.push({ ref: section, name: content || 'Section' });
      byIndent.length = 0;
      continue;
    }
    if (type === 'note') {
      const task = byIndent[byIndent.length - 1];
      if (task && content) task.comments.push({ content, author: row.author || null, attachments: [] });
      continue;
    }
    if (type !== 'task' || !content) continue;

    const indent = Math.max(1, Number(row.indent) || 1);
    const { content: text_, labels } = splitLabels(content);
    const date = readDate(row.date ?? '', today);
    if (row.date && !date.dueDate && !date.recurrenceRule) warnings.push(`Couldn't read the date "${row.date}" on "${text_}"`);
    const minutes = Number(row.duration);
    const task: ExportTask = {
      ref: `t${n++}`,
      content: text_ || content,
      description: row.description || null,
      sectionRef: section,
      parentRef: indent > 1 ? (byIndent[indent - 2]?.ref ?? null) : null,
      ...date,
      duration: Number.isFinite(minutes) && minutes > 0 ? (/day/i.test(row.duration_unit ?? '') ? minutes * 1440 : minutes) : null,
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(row.deadline ?? '') ? row.deadline : null,
      // Todoist's CSV numbers priority like its app: 1 is the highest.
      priority: Math.min(4, Math.max(1, Number(row.priority) || 4)),
      isCompleted: false,
      labels,
      comments: [],
      attachments: [],
    };
    project.tasks.push(task);
    byIndent[indent - 1] = task;
    byIndent.length = indent;
  }
  return { projects: [project], warnings };
}

const TRUE = /^(1|true|yes|y|x|done|completed)$/i;
const pick = (row: Record<string, string>, ...names: string[]) => names.map((n) => row[n]).find((v) => v !== undefined && v !== '') ?? '';

/**
 * One task per row. Columns (any case): content (or task, title, name),
 * description, project, section, due (or due date), due time, deadline,
 * priority (1–4 or p1–p4), labels (comma separated), completed.
 */
export function parseSimpleCsv(defaultProject: string, text: string, today = new Date()): CsvResult {
  const warnings: string[] = [];
  const projects = new Map<string, ExportProject>();
  let n = 0;
  for (const row of rows(text)) {
    const content = pick(row, 'content', 'task', 'title', 'name');
    if (!content) continue;
    const name = pick(row, 'project') || defaultProject;
    let project = projects.get(name);
    if (!project) {
      project = { ref: `p${projects.size}`, name, isArchived: false, isInbox: false, sections: [], tasks: [] };
      projects.set(name, project);
    }
    const sectionName = pick(row, 'section');
    let sectionRef: string | null = null;
    if (sectionName) {
      let section = project.sections.find((s) => s.name === sectionName);
      if (!section) {
        section = { ref: `${project.ref}s${project.sections.length}`, name: sectionName };
        project.sections.push(section);
      }
      sectionRef = section.ref;
    }
    const due = pick(row, 'due', 'due date', 'due_date', 'date');
    const date = readDate(due, today);
    if (due && !date.dueDate && !date.recurrenceRule) warnings.push(`Couldn't read the date "${due}" on "${content}"`);
    const time = pick(row, 'due time', 'due_time', 'time');
    const deadline = pick(row, 'deadline');
    const priority = Number(pick(row, 'priority').replace(/^p/i, ''));
    project.tasks.push({
      ref: `t${n++}`,
      content,
      description: pick(row, 'description', 'notes', 'note') || null,
      sectionRef,
      parentRef: null,
      ...date,
      ...(/^\d{1,2}:\d{2}$/.test(time) && { dueTime: time.padStart(5, '0') }),
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : null,
      priority: priority >= 1 && priority <= 4 ? priority : 4,
      isCompleted: TRUE.test(pick(row, 'completed', 'done', 'status')),
      labels: pick(row, 'labels', 'label', 'tags')
        .split(/[,;]/)
        .map((l) => l.trim().replace(/^@/, ''))
        .filter(Boolean),
      comments: [],
      attachments: [],
    });
  }
  return { projects: [...projects.values()], warnings };
}
