import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  activitySchema,
  attachmentSchema,
  commentSchema,
  notificationListResponse,
  searchResultsSchema,
  filterSchema,
  filterTaskSchema,
  labelSchema,
  memberSummarySchema,
  reminderSchema,
  todayViewSchema,
  upcomingViewSchema,
  ok,
  page,
  projectFieldsSchema,
  projectSchema,
  sectionSchema,
  taskDetailSchema,
  taskListItemSchema,
  taskSchema,
} from '@taskflow/contract';
import { prisma } from '../../config/database.js';
import * as labelService from '../../services/labelService.js';
import * as projectService from '../../services/projectService.js';
import * as sectionService from '../../services/sectionService.js';
import * as taskService from '../../services/taskService.js';
import * as viewService from '../../services/viewService.js';
import * as filterService from '../../services/filterService.js';
import * as commentService from '../../services/commentService.js';
import * as reminderService from '../../services/reminderService.js';
import * as fileService from '../../services/fileService.js';
import * as activityService from '../../services/activityService.js';
import * as searchService from '../../services/searchService.js';
import * as notificationService from '../../services/notificationService.js';

// Route suites mock the services, so only this file checks the contract
// against what Prisma really returns: nulls, Dates, nested includes. Each
// case runs a real service and encodes its result exactly as the route does.

const RUN = randomUUID().slice(0, 8);
let userId: string;
let projectId: string;
let sectionId: string;
let labelId: string;
let taskId: string;

function conforms(schema: z.ZodType, data: unknown) {
  const result = z.safeEncode(schema, data);
  if (!result.success) {
    throw new Error(
      result.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('\n'),
    );
  }
  return result.data;
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `contract-${RUN}@contract.test`, name: 'Contract', passwordHash: 'x', emailVerified: true },
  });
  userId = user.id;
  const project = await projectService.createProject({ name: `Contract ${RUN}` }, userId);
  projectId = project.id;
  sectionId = (await sectionService.createSection({ name: 'Doing', projectId }, userId)).id;
  labelId = (await labelService.createLabel({ name: `contract-${RUN}` }, userId)).id;
  const task = await taskService.createTask(
    {
      content: 'Contract task',
      projectId,
      sectionId,
      labelIds: [labelId],
      dueDate: '2026-10-01',
      dueTime: '09:30',
      priority: 2,
    },
    userId,
  );
  taskId = task.id;
  await taskService.createTask({ content: 'A subtask', projectId, parentId: taskId }, userId);
  await prisma.comment.create({ data: { content: 'Looks good', authorId: userId, taskId } });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.label.deleteMany({ where: { userId } });
  await prisma.workspace.deleteMany({ where: { ownerId: userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe('real service output matches the API contract', () => {
  it('projects: list, detail, members, archive', async () => {
    conforms(ok(z.array(projectSchema)), { success: true, data: await projectService.getUserProjects(userId) });
    const detail = conforms(ok(projectSchema), {
      success: true,
      data: await projectService.getProjectById(projectId, userId),
    }) as { data: { sections: Array<{ _count?: unknown }> } };
    expect(detail.data.sections[0]._count).toBeDefined();
    conforms(ok(z.array(memberSummarySchema)), {
      success: true,
      data: await projectService.getProjectMembers(projectId, userId),
    });
    conforms(ok(projectFieldsSchema), { success: true, data: await projectService.archiveProject(projectId, userId) });
    conforms(ok(projectFieldsSchema), { success: true, data: await projectService.unarchiveProject(projectId, userId) });
  });

  it('sections and labels', async () => {
    conforms(ok(z.array(sectionSchema)), {
      success: true,
      data: await sectionService.getProjectSections(projectId, userId),
    });
    conforms(ok(z.array(labelSchema)), { success: true, data: await labelService.getUserLabels(userId) });
  });

  it('tasks: page, detail, update, complete/uncomplete, duplicate', async () => {
    const { tasks, nextCursor } = await taskService.getTasks({ projectId }, userId);
    const list = conforms(page(taskListItemSchema), { success: true, data: tasks, nextCursor }) as {
      data: Array<{ dueDate: string | null; taskLabels: unknown[] }>;
    };
    expect(list.data[0].dueDate).toBe('2026-10-01T00:00:00.000Z');
    expect(list.data[0].taskLabels).toHaveLength(1);

    const detail = conforms(ok(taskDetailSchema), {
      success: true,
      data: await taskService.getTaskById(taskId, userId),
    }) as { data: { subtasks: unknown[]; comments: unknown[] } };
    expect(detail.data.subtasks).toHaveLength(1);
    expect(detail.data.comments).toHaveLength(1);

    conforms(ok(taskSchema), {
      success: true,
      data: await taskService.updateTask(taskId, { description: 'Now with notes' }, userId),
    });
    conforms(ok(taskSchema), { success: true, data: await taskService.completeTask(taskId, userId) });
    conforms(ok(taskSchema), { success: true, data: await taskService.uncompleteTask(taskId, userId) });
    conforms(ok(taskSchema), { success: true, data: await taskService.duplicateTask(taskId, userId) });
  });

  it('views: today and upcoming', async () => {
    conforms(ok(todayViewSchema), { success: true, data: await viewService.getTodayTasks(userId) });
    const upcoming = conforms(ok(upcomingViewSchema), {
      success: true,
      data: await viewService.getUpcomingTasks(userId, 30, true),
    }) as { data: { byDate: Record<string, unknown[]> } };
    expect(Object.keys(upcoming.data.byDate).length).toBeGreaterThan(0);
  });

  it('filters: saved filter and query results', async () => {
    const filter = await filterService.createFilter({ name: 'Mine', query: 'p2' }, userId);
    conforms(ok(filterSchema), { success: true, data: filter });
    const results = conforms(ok(z.array(filterTaskSchema)), {
      success: true,
      data: await filterService.executeFilter('p2', userId),
    }) as { data: unknown[] };
    expect(results.data.length).toBeGreaterThan(0);
    await prisma.filter.delete({ where: { id: filter.id } });
  });

  it('comments with replies', async () => {
    const top = await commentService.createComment(taskId, { content: 'Top level' }, userId);
    await commentService.createComment(taskId, { content: 'A reply', parentId: top.id }, userId);
    const list = conforms(ok(z.array(commentSchema)), {
      success: true,
      data: await commentService.getTaskComments(taskId, userId),
    }) as { data: Array<{ replies: unknown[] }> };
    expect(list.data.some((c) => c.replies.length === 1)).toBe(true);
  });

  it('reminders', async () => {
    const reminder = await reminderService.createReminder(
      { taskId, type: 'RELATIVE', minutesBefore: 30 },
      userId,
    );
    conforms(ok(reminderSchema), { success: true, data: reminder });
    conforms(ok(z.array(reminderSchema)), {
      success: true,
      data: await reminderService.getTaskReminders(taskId, userId),
    });
  });

  it('attachments (row only; storage is out of scope here)', async () => {
    await prisma.attachment.create({
      data: {
        filename: 'notes.txt',
        mimeType: 'text/plain',
        size: 12,
        url: `attachments/${userId}/contract-${RUN}`,
        taskId,
        uploadedById: userId,
      },
    });
    const list = conforms(ok(z.array(attachmentSchema)), {
      success: true,
      data: await fileService.getTaskAttachments(taskId, userId),
    }) as { data: Array<Record<string, unknown>> };
    expect(list.data[0]).not.toHaveProperty('url');
  });

  it('activity, search and notifications', async () => {
    conforms(ok(z.array(activitySchema)), {
      success: true,
      data: await activityService.getTaskActivity(taskId, userId),
    });
    const found = conforms(ok(searchResultsSchema), {
      success: true,
      data: await searchService.searchAll('Contract', userId, { limit: 10, offset: 0, entityTypes: ['task', 'project', 'comment'] }),
    }) as { data: { tasks: unknown[]; projects: unknown[] } };
    expect(found.data.tasks.length + found.data.projects.length).toBeGreaterThan(0);

    await notificationService.createNotification(userId, 'REMINDER', 'Reminder', 'Contract task is due', { taskId });
    conforms(notificationListResponse, {
      success: true,
      data: await notificationService.getUserNotifications(userId, false, 10),
      unreadCount: await notificationService.getUnreadCount(userId),
    });
  });
});
