import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  activitySchema,
  adminStatsSchema,
  adminUserDetailSchema,
  adminUserPageSchema,
  createdWorkspaceSchema,
  meSchema,
  notificationPreferencesSchema,
  profileSchema,
  templateSchema,
  workspaceInviteSchema,
  workspaceMemberSchema,
  workspaceSchema,
  workspaceSummarySchema,
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
  trashedTaskSchema,
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
import * as userService from '../../services/userService.js';
import * as adminService from '../../services/adminService.js';
import * as workspaceService from '../../services/workspaceService.js';
import * as templateService from '../../services/templateService.js';

// Route suites mock the services, so only this file checks the contract
// against what Prisma really returns: nulls, Dates, nested includes. Each
// case runs a real service and encodes its result exactly as the route does.

const RUN = randomUUID().slice(0, 8);
let userId: string;
let projectId: string;
let sectionId: string;
let labelId: string;
let taskId: string;

/** A service Page as the route sends it: `{ data, nextCursor }`. */
function pageBody<T>(p: { items: T[]; nextCursor: string | null }) {
  return { data: p.items, nextCursor: p.nextCursor };
}

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
    conforms(ok(z.array(labelSchema)), { success: true, data: await labelService.getLabels(userId) });
    conforms(ok(z.array(labelSchema)), { success: true, data: await labelService.getLabels(userId, { projectId }) });
  });

  it('tasks: page, detail, update, complete/uncomplete, duplicate', async () => {
    const { tasks, nextCursor } = await taskService.getTasks({ projectId }, userId);
    const list = conforms(page(taskListItemSchema), { success: true, data: tasks, nextCursor }) as {
      data: Array<{ dueDate: string | null; taskLabels: unknown[] }>;
    };
    expect(list.data[0].dueDate).toBe('2026-10-01');
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
    const copy = await taskService.duplicateTask(taskId, userId);
    conforms(ok(taskSchema), { success: true, data: copy });

    // Trash round trip, on the copy.
    await taskService.deleteTask(copy.id, userId);
    const trash = conforms(ok(z.array(trashedTaskSchema)), {
      success: true,
      data: await taskService.getTrash(userId),
    }) as { data: Array<{ id: string; purgeAt: string }> };
    expect(trash.data.map((t) => t.id)).toContain(copy.id);
    conforms(ok(taskSchema), { success: true, data: await taskService.restoreTask(copy.id, userId) });
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
    const results = conforms(page(filterTaskSchema), {
      success: true,
      ...pageBody(await filterService.executeFilter('p2', userId)),
    }) as { data: unknown[] };
    expect(results.data.length).toBeGreaterThan(0);
    await prisma.filter.delete({ where: { id: filter.id } });
  });

  it('comments with replies', async () => {
    const top = await commentService.createComment(taskId, { content: 'Top level' }, userId);
    await commentService.createComment(taskId, { content: 'A reply', parentId: top.id }, userId);
    const list = conforms(page(commentSchema), {
      success: true,
      ...pageBody(await commentService.getTaskComments(taskId, userId)),
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
    conforms(page(activitySchema), {
      success: true,
      ...pageBody(await activityService.getTaskActivity(taskId, userId)),
    });
    const found = conforms(ok(searchResultsSchema), {
      success: true,
      data: await searchService.searchAll('Contract', userId, { limit: 10, offset: 0, entityTypes: ['task', 'project', 'comment'] }),
    }) as { data: { tasks: unknown[]; projects: unknown[] } };
    expect(found.data.tasks.length + found.data.projects.length).toBeGreaterThan(0);

    await notificationService.createNotification(userId, 'REMINDER', 'Reminder', 'Contract task is due', { taskId });
    conforms(notificationListResponse, {
      success: true,
      ...pageBody(await notificationService.getUserNotifications(userId, false, 10)),
      unreadCount: await notificationService.getUnreadCount(userId),
    });
  });

  it('account: me, profile update, notification preferences', async () => {
    conforms(ok(meSchema), { success: true, data: await userService.getUserById(userId) });
    conforms(ok(profileSchema), {
      success: true,
      data: await userService.updateUser(userId, { timezone: 'Europe/London', theme: 'dark' }),
    });
    conforms(ok(notificationPreferencesSchema), {
      success: true,
      data: await notificationService.getNotificationPreferences(userId),
    });
  });

  it('admin: user page, detail, stats', async () => {
    conforms(ok(adminUserPageSchema), { success: true, data: await adminService.listUsers({ search: RUN }) });
    conforms(ok(adminUserDetailSchema), { success: true, data: await adminService.getUserDetail(userId) });
    conforms(ok(adminStatsSchema), { success: true, data: await adminService.getStats() });
  });

  it('workspaces: create, list, detail, members, invites', async () => {
    const ws = await workspaceService.createWorkspace({ name: `Team ${RUN}` }, userId);
    conforms(ok(createdWorkspaceSchema), { success: true, data: ws });
    conforms(ok(z.array(workspaceSummarySchema)), {
      success: true,
      data: await workspaceService.getUserWorkspaces(userId),
    });
    conforms(ok(workspaceSchema), { success: true, data: await workspaceService.getWorkspaceById(ws.id, userId) });
    conforms(ok(z.array(workspaceMemberSchema)), {
      success: true,
      data: await workspaceService.getWorkspaceMembers(ws.id, userId),
    });
    const invite = await workspaceService.inviteMember(ws.id, { email: `invitee-${RUN}@contract.test`, role: 'MEMBER' }, userId);
    conforms(ok(workspaceInviteSchema), { success: true, data: invite });
    conforms(ok(z.array(workspaceInviteSchema)), {
      success: true,
      data: await workspaceService.getPendingInvites(ws.id, userId),
    });
  });

  it('templates: built-in gallery and a saved project template', async () => {
    await templateService.ensureDefaultTemplates();
    const gallery = conforms(ok(z.array(templateSchema)), {
      success: true,
      data: await templateService.getPublicTemplates(),
    }) as { data: unknown[] };
    expect(gallery.data.length).toBeGreaterThan(0);
    const saved = await templateService.createTemplate({ name: `Tpl ${RUN}`, projectId }, userId);
    conforms(ok(templateSchema), { success: true, data: saved });
    await prisma.template.delete({ where: { id: saved.id } });
  });
});
