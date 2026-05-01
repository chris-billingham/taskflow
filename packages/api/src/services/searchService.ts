import { prisma } from '../config/database.js';

export interface TaskSearchResult {
  type: 'task';
  id: string;
  content: string;
  description: string | null;
  projectId: string;
  projectName: string;
  projectColor: string;
  dueDate: Date | null;
  isCompleted: boolean;
  priority: number;
  rank: number;
}

export interface ProjectSearchResult {
  type: 'project';
  id: string;
  name: string;
  color: string;
  taskCount: number;
  rank: number;
}

export interface CommentSearchResult {
  type: 'comment';
  id: string;
  content: string;
  taskId: string | null;
  taskContent: string | null;
  projectId: string | null;
  projectName: string | null;
  rank: number;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  entityTypes?: string[];
}

export interface SearchResults {
  tasks: TaskSearchResult[];
  projects: ProjectSearchResult[];
  comments: CommentSearchResult[];
}

export async function searchAll(
  query: string,
  userId: string,
  options: SearchOptions = {},
): Promise<SearchResults> {
  const { limit = 10, entityTypes = ['task', 'project', 'comment'] } = options;

  const [tasks, projects, comments] = await Promise.all([
    entityTypes.includes('task')
      ? searchTasks(query, userId, { limit })
      : Promise.resolve([]),
    entityTypes.includes('project')
      ? searchProjects(query, userId, { limit })
      : Promise.resolve([]),
    entityTypes.includes('comment')
      ? searchComments(query, userId, { limit })
      : Promise.resolve([]),
  ]);

  return { tasks, projects, comments };
}

export async function searchTasks(
  query: string,
  userId: string,
  options: SearchOptions = {},
): Promise<TaskSearchResult[]> {
  const { limit = 10, offset = 0 } = options;
  const searchPattern = `%${query}%`;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      content: string;
      description: string | null;
      projectId: string;
      projectName: string;
      projectColor: string;
      dueDate: Date | null;
      isCompleted: boolean;
      priority: number;
      rank: number;
    }>
  >`
    SELECT
      t.id,
      t.content,
      t.description,
      t."projectId",
      p.name AS "projectName",
      p.color AS "projectColor",
      t."dueDate",
      t."isCompleted",
      t.priority,
      COALESCE(
        ts_rank(
          to_tsvector('english', t.content || ' ' || COALESCE(t.description, '')),
          plainto_tsquery('english', ${query})
        ),
        0
      ) AS rank
    FROM tasks t
    JOIN projects p ON p.id = t."projectId"
    WHERE (
      t.content ILIKE ${searchPattern}
      OR t.description ILIKE ${searchPattern}
    )
    AND (
      t."creatorId" = ${userId}
      OR t."assigneeId" = ${userId}
      OR p."ownerId" = ${userId}
      OR EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm."projectId" = t."projectId" AND pm."userId" = ${userId}
      )
      OR EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm."workspaceId" = p."workspaceId" AND wm."userId" = ${userId}
      )
    )
    ORDER BY rank DESC, t."createdAt" DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return rows.map((r) => ({ ...r, type: 'task' as const }));
}

export async function searchProjects(
  query: string,
  userId: string,
  options: SearchOptions = {},
): Promise<ProjectSearchResult[]> {
  const { limit = 10, offset = 0 } = options;
  const searchPattern = `%${query}%`;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string;
      color: string;
      taskCount: bigint;
      rank: number;
    }>
  >`
    SELECT
      p.id,
      p.name,
      p.color,
      COUNT(t.id) AS "taskCount",
      COALESCE(
        ts_rank(
          to_tsvector('english', p.name || ' ' || COALESCE(p.description, '')),
          plainto_tsquery('english', ${query})
        ),
        0
      ) AS rank
    FROM projects p
    LEFT JOIN tasks t ON t."projectId" = p.id AND t."isCompleted" = false
    WHERE (
      p.name ILIKE ${searchPattern}
      OR p.description ILIKE ${searchPattern}
    )
    AND p."isArchived" = false
    AND (
      p."ownerId" = ${userId}
      OR EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm."projectId" = p.id AND pm."userId" = ${userId}
      )
      OR EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm."workspaceId" = p."workspaceId" AND wm."userId" = ${userId}
      )
    )
    GROUP BY p.id, p.name, p.color, p.description
    ORDER BY rank DESC, p."createdAt" DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return rows.map((r) => ({
    ...r,
    taskCount: Number(r.taskCount),
    type: 'project' as const,
  }));
}

export async function searchComments(
  query: string,
  userId: string,
  options: SearchOptions = {},
): Promise<CommentSearchResult[]> {
  const { limit = 10, offset = 0 } = options;
  const searchPattern = `%${query}%`;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      content: string;
      taskId: string | null;
      taskContent: string | null;
      projectId: string | null;
      projectName: string | null;
      rank: number;
    }>
  >`
    SELECT
      c.id,
      c.content,
      c."taskId",
      t.content AS "taskContent",
      COALESCE(c."projectId", t."projectId") AS "projectId",
      COALESCE(cp.name, tp.name) AS "projectName",
      COALESCE(
        ts_rank(
          to_tsvector('english', c.content),
          plainto_tsquery('english', ${query})
        ),
        0
      ) AS rank
    FROM comments c
    LEFT JOIN tasks t ON t.id = c."taskId"
    LEFT JOIN projects tp ON tp.id = t."projectId"
    LEFT JOIN projects cp ON cp.id = c."projectId"
    WHERE c.content ILIKE ${searchPattern}
    AND c."parentId" IS NULL
    AND (
      c."authorId" = ${userId}
      OR (
        c."taskId" IS NOT NULL
        AND (
          t."creatorId" = ${userId}
          OR t."assigneeId" = ${userId}
          OR tp."ownerId" = ${userId}
          OR EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm."projectId" = t."projectId" AND pm."userId" = ${userId}
          )
          OR EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm."workspaceId" = tp."workspaceId" AND wm."userId" = ${userId}
          )
        )
      )
      OR (
        c."projectId" IS NOT NULL
        AND (
          cp."ownerId" = ${userId}
          OR EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm."projectId" = c."projectId" AND pm."userId" = ${userId}
          )
          OR EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm."workspaceId" = cp."workspaceId" AND wm."userId" = ${userId}
          )
        )
      )
    )
    ORDER BY rank DESC, c."createdAt" DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return rows.map((r) => ({ ...r, type: 'comment' as const }));
}
