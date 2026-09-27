import { parseQuickAddText, textWithoutTokens } from '@taskflow/contract';
import { prisma } from '../config/database.js';
import { findProjectByName, projectAccessWhere } from '../services/access.js';
import { getUserTimezone, nowAsTzWallClock } from './dates.js';

export interface ParsedTask {
  content: string;
  dueDate?: string;
  dueTime?: string;
  priority?: number;
  projectId?: string;
  labelIds?: string[];
  duration?: number;
  recurrenceRule?: string;
  isRecurring?: boolean;
}

/**
 * Turn Quick Add text into a task. The shorthand is recognised by the shared
 * parser (@taskflow/contract, also used by the web app to highlight it); this
 * resolves #project and @label against what the user can use. A #word or
 * @word that doesn't name one of theirs stays in the task's text rather than
 * vanishing ("Fix issue #42", "email @support").
 */
export async function parseQuickAdd(text: string, userId: string): Promise<ParsedTask> {
  // Calendar words ("today", "Friday") mean the USER's calendar day.
  const today = nowAsTzWallClock(await getUserTimezone(userId));
  // Known names let multi-word ones ("#Home Renovation") parse as one token.
  const [projects, userLabels] = await Promise.all([
    prisma.project.findMany({ where: { AND: [projectAccessWhere(userId)], isArchived: false }, select: { name: true } }),
    prisma.label.findMany({ where: { userId }, select: { id: true, name: true } }),
  ]);
  const parsed = parseQuickAddText(text, today, {
    projects: projects.map((p) => p.name),
    labels: userLabels.map((l) => l.name),
  });
  const result: ParsedTask = {
    content: '',
    priority: parsed.priority,
    duration: parsed.duration,
    dueTime: parsed.dueTime,
    dueDate: parsed.dueDate,
    recurrenceRule: parsed.recurrenceRule,
    isRecurring: parsed.recurrenceRule ? true : undefined,
  };

  const consumed = parsed.tokens.filter((t) => t.type !== 'project' && t.type !== 'label');

  const projectToken = parsed.tokens.find((t) => t.type === 'project');
  if (projectToken?.name) {
    // An exact name among projects the user can add to, team projects included.
    const project = await findProjectByName(userId, projectToken.name, { minLevel: 'EDIT' });
    if (project) {
      result.projectId = project.id;
      consumed.push(projectToken);
    }
  }

  const labelTokens = parsed.tokens.filter((t) => t.type === 'label');
  if (labelTokens.length > 0) {
    // Matched in code: `mode: 'insensitive'` has no effect on `in` filters.
    const byName = new Map(userLabels.map((l) => [l.name.toLowerCase(), l.id]));
    const labelIds = new Set<string>();
    for (const token of labelTokens) {
      const id = byName.get(token.name!.toLowerCase());
      if (!id) continue;
      labelIds.add(id);
      consumed.push(token);
    }
    if (labelIds.size > 0) result.labelIds = [...labelIds];
  }

  result.content = textWithoutTokens(text, consumed);
  return result;
}
