// Shared by the task modules: Prisma includes, reference and access
// validation, and fire-and-forget side effects.
import { prisma } from '../../config/database.js';
import { ForbiddenError, ValidationError } from '../../errors/index.js';
import {
  effectiveProjectLevels,
  levelSatisfies,
  hasProjectAccess,
  type AccessLevel,
} from '../access.js';
import { notify } from '../notificationService.js';
import { logFailure } from '../../config/logger.js';

// Runs a post-mutation side effect (activity log, broadcast) without blocking
// the response. Failures are logged (with the request's reqId), not thrown.
export function runSideEffect(label: string, fn: () => Promise<unknown> | unknown) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.catch(logFailure(`${label} failed`));
    }
  } catch (err) {
    logFailure(`${label} failed`)(err);
  }
}

// Full include used on single-task detail endpoints (includes subtasks)
export const taskInclude = {
  taskLabels: {
    include: { label: true },
  },
  assignee: {
    select: { id: true, name: true, email: true, avatarUrl: true },
  },
  subtasks: {
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' as const },
    include: {
      taskLabels: { include: { label: true } },
      assignee: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
    },
  },
  _count: {
    select: { subtasks: { where: { deletedAt: null } }, comments: true },
  },
};

// Lean include used on list endpoints — omits subtask bodies to keep responses small
export const taskListInclude = {
  taskLabels: {
    include: { label: true },
  },
  assignee: {
    select: { id: true, name: true, email: true, avatarUrl: true },
  },
  _count: {
    select: { subtasks: { where: { deletedAt: null } }, comments: true },
  },
};

// Labels are per-user (Label.userId). Reject label ids that don't exist or
// belong to another user — otherwise a caller could attach (and, via the task
// response, read) another user's labels, or hit an opaque 500 on an FK error.
export async function assertLabelsOwned(labelIds: string[], userId: string) {
  const unique = [...new Set(labelIds)];
  if (unique.length === 0) return;
  const count = await prisma.label.count({
    where: { id: { in: unique }, userId },
  });
  if (count !== unique.length) {
    throw new ValidationError('One or more labels do not exist or are not yours');
  }
}

/**
 * Validate references a task points at. Every one of these is attacker-
 * controlled input that previously went straight into the write:
 * - sectionId must belong to the task's project (else the task renders in a
 *   foreign project's board, or nowhere).
 * - parentId must be a task in the SAME project and must not create a cycle.
 *   An unvalidated parentId let any user graft their task under an arbitrary
 *   task id — disclosing the victim's task content through the `parent`
 *   include and polluting their subtask lists.
 * - assigneeId must be a user who can see the project (assignment otherwise
 *   injects tasks into a stranger's views/search).
 */
export async function assertTaskReferences(
  {
    projectId,
    sectionId,
    parentId,
    assigneeId,
    taskId,
  }: {
    projectId: string;
    sectionId?: string | null;
    parentId?: string | null;
    assigneeId?: string | null;
    taskId?: string; // present on updates, for cycle detection
  },
) {
  if (sectionId) {
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      select: { projectId: true },
    });
    if (!section || section.projectId !== projectId) {
      throw new ValidationError('Section does not belong to this project');
    }
  }

  if (parentId) {
    if (taskId && parentId === taskId) {
      throw new ValidationError('A task cannot be its own parent');
    }
    const parent = await prisma.task.findUnique({
      where: { id: parentId },
      select: { projectId: true, parentId: true },
    });
    if (!parent || parent.projectId !== projectId) {
      throw new ValidationError('Parent task does not belong to this project');
    }
    // Walk the ancestor chain to reject cycles (bounded to be safe against
    // pre-existing bad data).
    if (taskId) {
      let cursor = parent.parentId;
      for (let depth = 0; cursor && depth < 100; depth++) {
        if (cursor === taskId) {
          throw new ValidationError('Cannot nest a task under its own subtask');
        }
        const next: { parentId: string | null } | null = await prisma.task.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
        cursor = next?.parentId ?? null;
      }
    }
  }

  if (assigneeId) {
    if (!(await hasProjectAccess(projectId, assigneeId, 'VIEW'))) {
      throw new ValidationError(
        'Assignee does not have access to this project',
      );
    }
  }
}

export type TaskWithProject = {
  id: string;
  projectId: string;
  assigneeId: string | null;
  project: { ownerId: string | null; workspaceId: string | null };
};

/**
 * Bulk access check: the user must hold `level` on every task's project (or
 * be the task's assignee, who can always work their own task). Resolved with
 * two queries regardless of task count.
 */
export async function verifyBulkTaskAccess(
  tasks: TaskWithProject[],
  userId: string,
  level: AccessLevel = 'EDIT',
) {
  const levels = await effectiveProjectLevels(
    tasks.map((t) => ({
      id: t.projectId,
      ownerId: t.project.ownerId,
      workspaceId: t.project.workspaceId,
    })),
    userId,
  );

  for (const task of tasks) {
    if (task.assigneeId === userId && levelSatisfies('EDIT', level)) continue;
    if (levelSatisfies(levels.get(task.projectId), level)) continue;
    throw new ForbiddenError('You do not have access to all specified tasks');
  }
}

/**
 * Tell an assignee that a task is theirs.
 *
 * Assignment is the notification users notice the absence of most — before
 * this, nothing in the app produced a TASK_ASSIGNED notice even though the
 * type, the preference toggle and the delivery channels all existed.
 * Self-assignment is deliberately silent.
 */
export async function notifyAssignment(
  task: { id: string; content: string; projectId: string; assigneeId: string | null },
  actorId: string,
) {
  if (!task.assigneeId || task.assigneeId === actorId) return;

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { name: true },
  });

  await notify(
    task.assigneeId,
    'TASK_ASSIGNED',
    'Task assigned to you',
    `${actor?.name ?? 'Someone'} assigned you "${task.content}"`,
    { taskId: task.id, projectId: task.projectId },
  );
}
