import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../errors/index.js';
import type {
  CreateTaskInput,
  UpdateTaskInput,
  TaskQuery,
  BulkTaskInput,
  MoveTaskInput,
} from '../schemas/task.js';
import { parseQuickAdd } from '../utils/quickAddParser.js';
import { getNextOccurrence } from '../utils/recurrence.js';
import { logActivity } from './activityService.js';
import {
  broadcastTaskCreated,
  broadcastTaskUpdated,
  broadcastTaskDeleted,
} from './syncService.js';

export const taskInclude = {
  taskLabels: {
    include: { label: true },
  },
  assignee: {
    select: { id: true, name: true, email: true, avatarUrl: true },
  },
  subtasks: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      taskLabels: { include: { label: true } },
      assignee: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
    },
  },
  _count: {
    select: { subtasks: true, comments: true },
  },
};

async function verifyTaskAccess(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { ownerId: true, workspaceId: true } } },
  });
  if (!task) {
    throw new NotFoundError('Task not found');
  }
  if (task.project.ownerId !== userId && task.creatorId !== userId) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: task.projectId, userId } },
    });
    if (!member) {
      // Check workspace membership for team projects
      if (task.project.workspaceId) {
        const wsMember = await prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: task.project.workspaceId,
              userId,
            },
          },
        });
        if (wsMember) return task;
      }
      throw new ForbiddenError('You do not have access to this task');
    }
  }
  return task;
}

async function verifyProjectAccess(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true, workspaceId: true },
  });
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  if (project.ownerId !== userId) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) {
      // Check workspace membership for team projects
      if (project.workspaceId) {
        const wsMember = await prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: { workspaceId: project.workspaceId, userId },
          },
        });
        if (wsMember) return project;
      }
      throw new ForbiddenError('You do not have access to this project');
    }
  }
  return project;
}

export async function getTasks(query: TaskQuery, userId: string) {
  // Get workspace IDs the user belongs to
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((m) => m.workspaceId);

  const where: any = {
    project: {
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } },
        ...(workspaceIds.length > 0
          ? [{ workspaceId: { in: workspaceIds } }]
          : []),
      ],
    },
  };

  if (query.projectId) {
    where.projectId = query.projectId;
  }
  if (query.sectionId) {
    where.sectionId = query.sectionId;
  }
  if (query.parentId) {
    where.parentId = query.parentId;
  } else if (!query.parentId) {
    // By default, only return top-level tasks
    where.parentId = null;
  }
  if (query.completed !== undefined) {
    where.isCompleted = query.completed === 'true';
  }
  if (query.priority) {
    const priorities = query.priority.split(',').map(Number);
    where.priority = { in: priorities };
  }
  if (query.assigneeId) {
    where.assigneeId = query.assigneeId;
  }
  if (query.labels) {
    const labelIds = query.labels.split(',');
    where.taskLabels = { some: { labelId: { in: labelIds } } };
  }
  if (query.dueDateFrom || query.dueDateTo) {
    where.dueDate = {};
    if (query.dueDateFrom) where.dueDate.gte = new Date(query.dueDateFrom);
    if (query.dueDateTo) where.dueDate.lte = new Date(query.dueDateTo);
  }
  if (query.search) {
    where.content = { contains: query.search, mode: 'insensitive' };
  }

  const tasks = await prisma.task.findMany({
    where,
    include: taskInclude,
    orderBy: { sortOrder: 'asc' },
  });

  return tasks;
}

export async function getTaskById(id: string, userId: string) {
  await verifyTaskAccess(id, userId);

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      ...taskInclude,
      project: {
        select: { id: true, name: true, color: true },
      },
      section: {
        select: { id: true, name: true },
      },
      parent: {
        select: { id: true, content: true },
      },
      comments: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          author: {
            select: { id: true, name: true, avatarUrl: true },
          },
        },
      },
    },
  });

  if (!task) {
    throw new NotFoundError('Task not found');
  }

  return task;
}

export async function createTask(data: CreateTaskInput, userId: string) {
  await verifyProjectAccess(data.projectId, userId);

  // Get max sortOrder
  const maxSort = await prisma.task.aggregate({
    where: {
      projectId: data.projectId,
      sectionId: data.sectionId ?? null,
      parentId: data.parentId ?? null,
    },
    _max: { sortOrder: true },
  });

  const task = await prisma.task.create({
    data: {
      content: data.content,
      description: data.description,
      projectId: data.projectId,
      sectionId: data.sectionId,
      parentId: data.parentId,
      creatorId: userId,
      assigneeId: data.assigneeId,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      dueTime: data.dueTime,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      duration: data.duration,
      priority: data.priority ?? 4,
      isRecurring: data.isRecurring ?? false,
      recurrenceRule: data.recurrenceRule,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      taskLabels: data.labelIds?.length
        ? {
            create: data.labelIds.map((labelId) => ({ labelId })),
          }
        : undefined,
    },
    include: taskInclude,
  });

  logActivity({
    action: 'CREATED',
    entityType: 'TASK',
    entityId: task.id,
    userId,
    taskId: task.id,
    newData: { content: data.content, projectId: data.projectId },
  }).catch(console.error);

  broadcastTaskCreated(task);

  return task;
}

export async function updateTask(
  id: string,
  data: UpdateTaskInput,
  userId: string,
) {
  const oldTask = await verifyTaskAccess(id, userId);

  const { labelIds, ...updateData } = data;

  // Prepare date fields
  const prismaData: any = { ...updateData };
  if (updateData.dueDate !== undefined) {
    prismaData.dueDate = updateData.dueDate ? new Date(updateData.dueDate) : null;
  }
  if (updateData.deadline !== undefined) {
    prismaData.deadline = updateData.deadline ? new Date(updateData.deadline) : null;
  }

  // Handle label updates
  if (labelIds !== undefined) {
    await prisma.taskLabel.deleteMany({ where: { taskId: id } });
    if (labelIds.length > 0) {
      await prisma.taskLabel.createMany({
        data: labelIds.map((labelId) => ({ taskId: id, labelId })),
      });
    }
  }

  const task = await prisma.task.update({
    where: { id },
    data: prismaData,
    include: taskInclude,
  });

  logActivity({
    action: 'UPDATED',
    entityType: 'TASK',
    entityId: id,
    userId,
    taskId: id,
    oldData: { content: oldTask.content, priority: oldTask.priority, dueDate: oldTask.dueDate?.toISOString() ?? null },
    newData: data as Record<string, unknown>,
  }).catch(console.error);

  broadcastTaskUpdated(task);

  return task;
}

export async function deleteTask(id: string, userId: string) {
  const task = await verifyTaskAccess(id, userId);

  // Cascade delete handles subtasks via Prisma schema
  await prisma.task.delete({ where: { id } });

  logActivity({
    action: 'DELETED',
    entityType: 'TASK',
    entityId: id,
    userId,
    oldData: { content: task.content, projectId: task.projectId },
  }).catch(console.error);

  broadcastTaskDeleted(id, task.projectId);

  return { message: 'Task deleted successfully' };
}

export async function completeTask(id: string, userId: string) {
  const task = await verifyTaskAccess(id, userId);

  if (task.isRecurring && task.recurrenceRule) {
    const fromDate = task.dueDate || new Date();
    const nextDate = getNextOccurrence(task.recurrenceRule, fromDate);

    const [completedTask, newTask] = await Promise.all([
      prisma.task.update({
        where: { id },
        data: { isCompleted: true, completedAt: new Date() },
        include: taskInclude,
      }),
      prisma.task.create({
        data: {
          content: task.content,
          description: task.description,
          projectId: task.projectId,
          sectionId: task.sectionId,
          parentId: task.parentId,
          creatorId: task.creatorId,
          assigneeId: task.assigneeId,
          dueDate: nextDate,
          dueTime: task.dueTime,
          deadline: task.deadline,
          duration: task.duration,
          priority: task.priority,
          isRecurring: true,
          recurrenceRule: task.recurrenceRule,
          sortOrder: task.sortOrder,
        },
        include: taskInclude,
      }),
    ]);

    broadcastTaskUpdated(completedTask);
    broadcastTaskCreated(newTask);

    return newTask;
  }

  const updated = await prisma.task.update({
    where: { id },
    data: { isCompleted: true, completedAt: new Date() },
    include: taskInclude,
  });

  logActivity({
    action: 'COMPLETED',
    entityType: 'TASK',
    entityId: id,
    userId,
    taskId: id,
    newData: { content: task.content },
  }).catch(console.error);

  broadcastTaskUpdated(updated);

  return updated;
}

export async function uncompleteTask(id: string, userId: string) {
  const oldTask = await verifyTaskAccess(id, userId);

  const task = await prisma.task.update({
    where: { id },
    data: { isCompleted: false, completedAt: null },
    include: taskInclude,
  });

  logActivity({
    action: 'UNCOMPLETED',
    entityType: 'TASK',
    entityId: id,
    userId,
    taskId: id,
    newData: { content: oldTask.content },
  }).catch(console.error);

  broadcastTaskUpdated(task);

  return task;
}

export async function moveTask(
  id: string,
  data: MoveTaskInput,
  userId: string,
) {
  const oldTask = await verifyTaskAccess(id, userId);

  if (data.projectId) {
    await verifyProjectAccess(data.projectId, userId);
  }

  const updateData: any = {};
  if (data.projectId !== undefined) updateData.projectId = data.projectId;
  if (data.sectionId !== undefined) updateData.sectionId = data.sectionId;
  if (data.parentId !== undefined) updateData.parentId = data.parentId;

  const task = await prisma.task.update({
    where: { id },
    data: updateData,
    include: taskInclude,
  });

  logActivity({
    action: 'MOVED',
    entityType: 'TASK',
    entityId: id,
    userId,
    taskId: id,
    oldData: { projectId: oldTask.projectId, sectionId: oldTask.sectionId },
    newData: data as Record<string, unknown>,
  }).catch(console.error);

  broadcastTaskUpdated(task);

  return task;
}

export async function duplicateTask(id: string, userId: string) {
  const original = await verifyTaskAccess(id, userId);

  const task = await prisma.task.create({
    data: {
      content: original.content,
      description: original.description,
      projectId: original.projectId,
      sectionId: original.sectionId,
      parentId: original.parentId,
      creatorId: userId,
      assigneeId: original.assigneeId,
      dueDate: original.dueDate,
      dueTime: original.dueTime,
      deadline: original.deadline,
      duration: original.duration,
      priority: original.priority,
      isRecurring: original.isRecurring,
      recurrenceRule: original.recurrenceRule,
      sortOrder: original.sortOrder + 1,
    },
    include: taskInclude,
  });

  return task;
}

export async function bulkUpdate(
  data: BulkTaskInput,
  userId: string,
) {
  const { taskIds, action, data: actionData } = data;

  // Verify access to all tasks
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    include: { project: { select: { ownerId: true } } },
  });

  if (tasks.length !== taskIds.length) {
    throw new NotFoundError('One or more tasks not found');
  }

  for (const task of tasks) {
    if (task.project.ownerId !== userId && task.creatorId !== userId) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: task.projectId, userId } },
      });
      if (!member) {
        throw new ForbiddenError('You do not have access to all specified tasks');
      }
    }
  }

  switch (action) {
    case 'complete':
      await prisma.task.updateMany({
        where: { id: { in: taskIds } },
        data: { isCompleted: true, completedAt: new Date() },
      });
      break;

    case 'uncomplete':
      await prisma.task.updateMany({
        where: { id: { in: taskIds } },
        data: { isCompleted: false, completedAt: null },
      });
      break;

    case 'delete':
      await prisma.task.deleteMany({
        where: { id: { in: taskIds } },
      });
      break;

    case 'move':
      if (actionData?.projectId) {
        await verifyProjectAccess(actionData.projectId, userId);
      }
      await prisma.task.updateMany({
        where: { id: { in: taskIds } },
        data: {
          ...(actionData?.projectId && { projectId: actionData.projectId }),
          ...(actionData?.sectionId !== undefined && { sectionId: actionData.sectionId }),
        },
      });
      break;

    case 'updatePriority':
      if (actionData?.priority) {
        await prisma.task.updateMany({
          where: { id: { in: taskIds } },
          data: { priority: actionData.priority },
        });
      }
      break;
  }

  return { message: `Bulk ${action} completed successfully`, count: taskIds.length };
}

export async function quickAddTask(
  text: string,
  defaultProjectId: string | undefined,
  userId: string,
) {
  const parsed = await parseQuickAdd(text, userId);

  // Use parsed projectId, or default, or user's first project
  let projectId = parsed.projectId || defaultProjectId;
  if (!projectId) {
    const defaultProject = await prisma.project.findFirst({
      where: { ownerId: userId, isInbox: true },
      select: { id: true },
    });
    if (!defaultProject) {
      throw new NotFoundError('No default project found');
    }
    projectId = defaultProject.id;
  }

  return createTask(
    {
      content: parsed.content,
      projectId,
      dueDate: parsed.dueDate,
      dueTime: parsed.dueTime,
      priority: parsed.priority,
      labelIds: parsed.labelIds,
      duration: parsed.duration,
      isRecurring: parsed.isRecurring,
      recurrenceRule: parsed.recurrenceRule,
    },
    userId,
  );
}

export async function reorderTasks(taskIds: string[], userId: string) {
  if (taskIds.length === 0) return { message: 'Nothing to reorder' };

  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    include: { project: { select: { ownerId: true } } },
  });

  if (tasks.length !== taskIds.length) {
    throw new NotFoundError('One or more tasks not found');
  }

  for (const task of tasks) {
    if (task.project.ownerId !== userId && task.creatorId !== userId) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: task.projectId, userId } },
      });
      if (!member) {
        throw new ForbiddenError('You do not have access to reorder these tasks');
      }
    }
  }

  const updates = taskIds.map((id, index) =>
    prisma.task.update({
      where: { id },
      data: { sortOrder: index },
    }),
  );

  await prisma.$transaction(updates);

  return { message: 'Tasks reordered successfully' };
}
