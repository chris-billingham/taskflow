import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { projectAccessWhere } from '../services/access.js';

interface ParseContext {
  userId: string;
  now: Date;
  todayStart: Date;
  todayEnd: Date;
}

// Token types for the lexer
type TokenType =
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'ATOM';

interface Token {
  type: TokenType;
  value: string;
}

function getDateRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function parseRelativeDate(dateStr: string, ctx: ParseContext): Date | null {
  const lower = dateStr.trim().toLowerCase();
  if (lower === 'today') return ctx.todayStart;
  if (lower === 'tomorrow') return addDays(ctx.todayStart, 1);
  if (lower === 'yesterday') return addDays(ctx.todayStart, -1);

  // "next N days" pattern
  const nextDaysMatch = lower.match(/^next\s+(\d+)\s+days?$/);
  if (nextDaysMatch) {
    return addDays(ctx.todayStart, parseInt(nextDaysMatch[1], 10));
  }

  // Try ISO date
  const parsed = new Date(dateStr.trim());
  if (!isNaN(parsed.getTime())) return parsed;

  return null;
}

// Tokenize the query string
function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = query.length;

  while (i < len) {
    // Skip whitespace
    if (query[i] === ' ' || query[i] === '\t') {
      i++;
      continue;
    }

    // Parentheses
    if (query[i] === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }
    if (query[i] === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }

    // Boolean operators
    if (query[i] === '&') {
      tokens.push({ type: 'AND', value: '&' });
      i++;
      continue;
    }
    if (query[i] === '|') {
      tokens.push({ type: 'OR', value: '|' });
      i++;
      continue;
    }
    if (query[i] === '!') {
      // Check if it's part of a keyword like !recurring or !completed or !subtask
      const rest = query.slice(i + 1);
      const keywordMatch = rest.match(/^(recurring|completed|subtask)\b/i);
      if (keywordMatch) {
        tokens.push({ type: 'ATOM', value: '!' + keywordMatch[1] });
        i += 1 + keywordMatch[1].length;
        continue;
      }
      // Check for !# (not project)
      if (rest.startsWith('#')) {
        // Read until whitespace, &, |, or )
        let j = i + 2;
        while (j < len && query[j] !== ' ' && query[j] !== '&' && query[j] !== '|' && query[j] !== ')') {
          j++;
        }
        tokens.push({ type: 'ATOM', value: query.slice(i, j) });
        i = j;
        continue;
      }
      tokens.push({ type: 'NOT', value: '!' });
      i++;
      continue;
    }

    // Read an atom (everything until a boolean operator or paren)
    let atom = '';
    while (i < len) {
      if (query[i] === '&' || query[i] === '|' || query[i] === '(' || query[i] === ')') {
        break;
      }
      // Special: only break on ! if not inside a keyword
      if (query[i] === '!' && atom.length > 0) {
        break;
      }
      atom += query[i];
      i++;
    }

    atom = atom.trim();
    if (atom.length > 0) {
      tokens.push({ type: 'ATOM', value: atom });
    }
  }

  return tokens;
}

// A clause that matches no rows. Used when a positive lookup (project/label/user
// by name) resolves to nothing: `#Nonexistent` must match nothing, not everything.
// Returning `{}` here made e.g. `#Nonexistent | p1` an OR-with-empty-clause, which
// matches every accessible task.
const MATCH_NONE: Prisma.TaskWhereInput = { id: { in: [] } };

// Parse an atom into a Prisma where clause
async function parseAtom(atom: string, ctx: ParseContext): Promise<Prisma.TaskWhereInput> {
  const lower = atom.toLowerCase().trim();

  // Date filters
  if (lower === 'today') {
    return {
      dueDate: { gte: ctx.todayStart, lte: ctx.todayEnd },
      isCompleted: false,
    };
  }
  if (lower === 'tomorrow') {
    const tom = addDays(ctx.todayStart, 1);
    const { start, end } = getDateRange(tom);
    return { dueDate: { gte: start, lte: end }, isCompleted: false };
  }
  if (lower === 'overdue') {
    return {
      dueDate: { lt: ctx.todayStart },
      isCompleted: false,
    };
  }
  if (lower === 'no date') {
    return { dueDate: null, isCompleted: false };
  }

  // Due date filters
  const dueMatch = lower.match(/^due:\s*(.+)$/);
  if (dueMatch) {
    const dateVal = dueMatch[1].trim();
    if (dateVal === 'today') {
      return { dueDate: { gte: ctx.todayStart, lte: ctx.todayEnd } };
    }
    if (dateVal === 'tomorrow') {
      const tom = addDays(ctx.todayStart, 1);
      const { start, end } = getDateRange(tom);
      return { dueDate: { gte: start, lte: end } };
    }
    // "next N days"
    const nextDays = dateVal.match(/^next\s+(\d+)\s+days?$/);
    if (nextDays) {
      const end = addDays(ctx.todayStart, parseInt(nextDays[1], 10));
      return { dueDate: { gte: ctx.todayStart, lte: end } };
    }
    const parsed = parseRelativeDate(dateVal, ctx);
    if (parsed) {
      const { start, end } = getDateRange(parsed);
      return { dueDate: { gte: start, lte: end } };
    }
    return {};
  }

  const dueBeforeMatch = lower.match(/^due before:\s*(.+)$/);
  if (dueBeforeMatch) {
    const parsed = parseRelativeDate(dueBeforeMatch[1], ctx);
    if (parsed) return { dueDate: { lt: parsed } };
    return {};
  }

  const dueAfterMatch = lower.match(/^due after:\s*(.+)$/);
  if (dueAfterMatch) {
    const parsed = parseRelativeDate(dueAfterMatch[1], ctx);
    if (parsed) return { dueDate: { gt: parsed } };
    return {};
  }

  // Priority filters
  if (lower === 'p1' || lower === 'priority 1') return { priority: 1 };
  if (lower === 'p2' || lower === 'priority 2') return { priority: 2 };
  if (lower === 'p3' || lower === 'priority 3') return { priority: 3 };
  if (lower === 'p4' || lower === 'priority 4') return { priority: 4 };

  // Project filters: #ProjectName or ##Parent/Child
  if (atom.startsWith('!#')) {
    const projectName = atom.slice(2).trim();
    const project = await prisma.project.findFirst({
      where: {
        name: { equals: projectName, mode: 'insensitive' },
        AND: [projectAccessWhere(ctx.userId)],
      },
    });
    if (project) {
      return { projectId: { not: project.id } };
    }
    return {};
  }

  if (atom.startsWith('##')) {
    const path = atom.slice(2).trim();
    const parts = path.split('/');
    // Find parent/child project hierarchy
    let currentProject = null;
    for (const part of parts) {
      const where: Prisma.ProjectWhereInput = {
        name: { equals: part.trim(), mode: 'insensitive' },
        // Any project the user can see, not just owned ones — team projects
        // were unfindable by name in filters.
        AND: [projectAccessWhere(ctx.userId)],
      };
      if (currentProject) {
        where.parentId = currentProject.id;
      }
      currentProject = await prisma.project.findFirst({ where });
    }
    if (currentProject) {
      return { projectId: currentProject.id };
    }
    return MATCH_NONE;
  }

  if (atom.startsWith('#')) {
    const projectName = atom.slice(1).trim();
    const project = await prisma.project.findFirst({
      where: {
        name: { equals: projectName, mode: 'insensitive' },
        ownerId: ctx.userId,
      },
    });
    if (project) {
      return { projectId: project.id };
    }
    return MATCH_NONE;
  }

  // Label filter: @labelname
  if (atom.startsWith('@')) {
    const labelName = atom.slice(1).trim();
    const label = await prisma.label.findFirst({
      where: {
        name: { equals: labelName, mode: 'insensitive' },
        userId: ctx.userId,
      },
    });
    if (label) {
      return {
        taskLabels: { some: { labelId: label.id } },
      };
    }
    return MATCH_NONE;
  }

  // Assigned to
  const assignedToMatch = lower.match(/^assigned to:\s*(.+)$/);
  if (assignedToMatch) {
    const name = assignedToMatch[1].trim();
    if (name === 'me') {
      return { assigneeId: ctx.userId };
    }
    const user = await prisma.user.findFirst({
      where: { name: { contains: name, mode: 'insensitive' } },
    });
    if (user) {
      return { assigneeId: user.id };
    }
    return MATCH_NONE;
  }

  // Assigned by
  const assignedByMatch = lower.match(/^assigned by:\s*(.+)$/);
  if (assignedByMatch) {
    const name = assignedByMatch[1].trim();
    if (name === 'me') {
      return { creatorId: ctx.userId, assigneeId: { not: null } };
    }
    const user = await prisma.user.findFirst({
      where: { name: { contains: name, mode: 'insensitive' } },
    });
    if (user) {
      return { creatorId: user.id, assigneeId: { not: null } };
    }
    return MATCH_NONE;
  }

  // Search
  const searchMatch = lower.match(/^search:\s*(.+)$/);
  if (searchMatch) {
    const keyword = searchMatch[1].trim();
    return {
      OR: [
        { content: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ],
    };
  }

  // Subtask filters
  if (lower === '(subtask)' || lower === 'subtask') {
    return { parentId: { not: null } };
  }
  if (lower === '(!subtask)' || lower === '!subtask') {
    return { parentId: null };
  }

  // Created date filters
  const createdMatch = lower.match(/^created:\s*(.+)$/);
  if (createdMatch) {
    const parsed = parseRelativeDate(createdMatch[1], ctx);
    if (parsed) {
      const { start, end } = getDateRange(parsed);
      return { createdAt: { gte: start, lte: end } };
    }
    return {};
  }

  const createdBeforeMatch = lower.match(/^created before:\s*(.+)$/);
  if (createdBeforeMatch) {
    const parsed = parseRelativeDate(createdBeforeMatch[1], ctx);
    if (parsed) return { createdAt: { lt: parsed } };
    return {};
  }

  const createdAfterMatch = lower.match(/^created after:\s*(.+)$/);
  if (createdAfterMatch) {
    const parsed = parseRelativeDate(createdAfterMatch[1], ctx);
    if (parsed) return { createdAt: { gt: parsed } };
    return {};
  }

  // Recurring filters
  if (lower === 'recurring') return { isRecurring: true };
  if (lower === '!recurring') return { isRecurring: false };

  // Completed filters
  if (lower === 'completed') return { isCompleted: true };
  if (lower === '!completed') return { isCompleted: false };

  // Fallback: treat as a search keyword
  return {
    OR: [
      { content: { contains: atom.trim(), mode: 'insensitive' } },
      { description: { contains: atom.trim(), mode: 'insensitive' } },
    ],
  };
}

// Recursive descent parser for boolean expressions
// Grammar:
//   expr     -> orExpr
//   orExpr   -> andExpr ( '|' andExpr )*
//   andExpr  -> unaryExpr ( '&' unaryExpr )*
//   unaryExpr -> '!' unaryExpr | primary
//   primary  -> '(' expr ')' | atom

class FilterParser {
  private tokens: Token[];
  private pos: number;
  private ctx: ParseContext;

  constructor(tokens: Token[], ctx: ParseContext) {
    this.tokens = tokens;
    this.pos = 0;
    this.ctx = ctx;
  }

  private peek(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  private consume(type?: TokenType): Token | null {
    const token = this.peek();
    if (token && (!type || token.type === type)) {
      this.pos++;
      return token;
    }
    return null;
  }

  async parse(): Promise<Prisma.TaskWhereInput> {
    if (this.tokens.length === 0) return {};
    const result = await this.parseOr();
    return result;
  }

  private async parseOr(): Promise<Prisma.TaskWhereInput> {
    const left = await this.parseAnd();
    const orClauses: Prisma.TaskWhereInput[] = [left];

    while (this.peek()?.type === 'OR') {
      this.consume('OR');
      const right = await this.parseAnd();
      orClauses.push(right);
    }

    if (orClauses.length === 1) return orClauses[0];
    return { OR: orClauses };
  }

  private async parseAnd(): Promise<Prisma.TaskWhereInput> {
    const left = await this.parseUnary();
    const andClauses: Prisma.TaskWhereInput[] = [left];

    while (this.peek()?.type === 'AND') {
      this.consume('AND');
      const right = await this.parseUnary();
      andClauses.push(right);
    }

    if (andClauses.length === 1) return andClauses[0];
    return { AND: andClauses };
  }

  private async parseUnary(): Promise<Prisma.TaskWhereInput> {
    if (this.peek()?.type === 'NOT') {
      this.consume('NOT');
      const inner = await this.parseUnary();
      return { NOT: inner };
    }
    return this.parsePrimary();
  }

  private async parsePrimary(): Promise<Prisma.TaskWhereInput> {
    if (this.peek()?.type === 'LPAREN') {
      this.consume('LPAREN');
      const expr = await this.parseOr();
      this.consume('RPAREN');
      return expr;
    }

    const token = this.consume('ATOM');
    if (token) {
      return parseAtom(token.value, this.ctx);
    }

    return {};
  }
}

export async function parseFilterQuery(
  query: string,
  userId: string,
): Promise<Prisma.TaskWhereInput> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const ctx: ParseContext = { userId, now, todayStart, todayEnd };
  const tokens = tokenize(query);
  const parser = new FilterParser(tokens, ctx);
  return parser.parse();
}

export function validateFilterQuery(query: string): { valid: boolean; error?: string } {
  try {
    const tokens = tokenize(query);

    // Basic validation: check balanced parentheses
    let depth = 0;
    for (const token of tokens) {
      if (token.type === 'LPAREN') depth++;
      if (token.type === 'RPAREN') depth--;
      if (depth < 0) return { valid: false, error: 'Unmatched closing parenthesis' };
    }
    if (depth !== 0) return { valid: false, error: 'Unmatched opening parenthesis' };

    // Check no empty expressions between operators
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if ((t.type === 'AND' || t.type === 'OR') && i === 0) {
        return { valid: false, error: 'Query cannot start with an operator' };
      }
      if ((t.type === 'AND' || t.type === 'OR') && i === tokens.length - 1) {
        return { valid: false, error: 'Query cannot end with an operator' };
      }
      if (
        (t.type === 'AND' || t.type === 'OR') &&
        i + 1 < tokens.length &&
        (tokens[i + 1].type === 'AND' || tokens[i + 1].type === 'OR')
      ) {
        return { valid: false, error: 'Consecutive operators are not allowed' };
      }
    }

    if (tokens.length === 0) {
      return { valid: false, error: 'Query is empty' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid query syntax' };
  }
}
