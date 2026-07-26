import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/database.js';
import {
  createTask,
  updateTask,
  completeTask,
  moveTask,
  bulkUpdate,
} from '../../services/taskService.js';
import { createReminder } from '../../services/reminderService.js';

// Multi-user correctness behaviors against real Postgres: cross-project moves,
// recurring completion, reminder re-arming.

const RUN = randomUUID().slice(0, 8);
let userId = '';
let projectAId = '';
let projectBId = '';
let sectionAId = '';

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      email: `tl-${RUN}@lifecycle.test`,
      passwordHash: 'x',
      name: 'tl-user',
      emailVerified: true,
    },
  });
  userId = user.id;

  const a = await prisma.project.create({
    data: { name: `TL A ${RUN}`, ownerId: userId },
  });
  const b = await prisma.project.create({
    data: { name: `TL B ${RUN}`, ownerId: userId },
  });
  projectAId = a.id;
  projectBId = b.id;

  const section = await prisma.section.create({
    data: { name: 'A section', projectId: projectAId },
  });
  sectionAId = section.id;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: [projectAId, projectBId] } } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('cross-project moves', () => {
  it('clears the stale section and brings the whole subtask tree along', async () => {
    const parent = await createTask(
      { content: 'move-parent', projectId: projectAId, sectionId: sectionAId },
      userId,
    );
    const child = await createTask(
      { content: 'move-child', projectId: projectAId, parentId: parent.id },
      userId,
    );
    const grandchild = await createTask(
      { content: 'move-grandchild', projectId: projectAId, parentId: child.id },
      userId,
    );

    await moveTask(parent.id, { projectId: projectBId }, userId);

    const rows = await prisma.task.findMany({
      where: { id: { in: [parent.id, child.id, grandchild.id] } },
      select: { id: true, projectId: true, sectionId: true },
    });
    for (const row of rows) {
      expect(row.projectId, `task ${row.id} should be in project B`).toBe(projectBId);
      expect(row.sectionId, 'sections cannot cross projects').toBeNull();
    }
  });

  it('bulk move also migrates descendants and clears sections', async () => {
    const parent = await createTask(
      { content: 'bulk-parent', projectId: projectAId, sectionId: sectionAId },
      userId,
    );
    const child = await createTask(
      { content: 'bulk-child', projectId: projectAId, parentId: parent.id },
      userId,
    );

    await bulkUpdate(
      { taskIds: [parent.id], action: 'move', data: { projectId: projectBId } },
      userId,
    );

    const rows = await prisma.task.findMany({
      where: { id: { in: [parent.id, child.id] } },
      select: { projectId: true, sectionId: true },
    });
    for (const row of rows) {
      expect(row.projectId).toBe(projectBId);
      expect(row.sectionId).toBeNull();
    }
  });
});

describe('recurring completion', () => {
  it('bulk complete spawns the next occurrence (raw updateMany used to kill the series)', async () => {
    const recurring = await createTask(
      {
        content: `bulk-recurring ${RUN}`,
        projectId: projectAId,
        dueDate: '2026-07-20',
        isRecurring: true,
        recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
      },
      userId,
    );

    await bulkUpdate({ taskIds: [recurring.id], action: 'complete' }, userId);

    const next = await prisma.task.findFirst({
      where: {
        content: `bulk-recurring ${RUN}`,
        isCompleted: false,
        id: { not: recurring.id },
      },
    });
    expect(next).not.toBeNull();
    expect(next!.dueDate?.toISOString().slice(0, 10)).toBe('2026-07-21');
  });

  it('COUNT winds down and ends the series', async () => {
    const task = await createTask(
      {
        content: `count-series ${RUN}`,
        projectId: projectAId,
        dueDate: '2026-07-20',
        isRecurring: true,
        recurrenceRule: 'FREQ=DAILY;INTERVAL=1;COUNT=2',
      },
      userId,
    );

    // Completing occurrence 1 of 2 spawns the final occurrence with COUNT=1.
    const second = await completeTask(task.id, userId);
    expect(second.id).not.toBe(task.id);
    expect(second.recurrenceRule).toBe('FREQ=DAILY;INTERVAL=1;COUNT=1');

    // Completing the final occurrence spawns nothing.
    const done = await completeTask(second.id, userId);
    expect(done.id).toBe(second.id);
    expect(done.isCompleted).toBe(true);
    const extras = await prisma.task.findMany({
      where: { content: `count-series ${RUN}`, isCompleted: false },
    });
    expect(extras).toHaveLength(0);
  });

  it('carries RELATIVE reminders and the deadline offset to the next occurrence', async () => {
    const task = await createTask(
      {
        content: `reminder-series ${RUN}`,
        projectId: projectAId,
        dueDate: '2026-07-20',
        deadline: '2026-07-22',
        isRecurring: true,
        recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1',
      },
      userId,
    );
    await createReminder(
      { taskId: task.id, type: 'RELATIVE', minutesBefore: 60 },
      userId,
    );

    const next = await completeTask(task.id, userId);

    // Deadline stays 2 days after the due date instead of the stale absolute.
    expect(next.dueDate?.toISOString().slice(0, 10)).toBe('2026-07-27');
    expect(next.deadline?.toISOString().slice(0, 10)).toBe('2026-07-29');

    const carried = await prisma.reminder.findMany({ where: { taskId: next.id } });
    expect(carried).toHaveLength(1);
    expect(carried[0].minutesBefore).toBe(60);
    expect(carried[0].isSent).toBe(false);
    // 60 minutes before UTC-midnight of the new due date.
    expect(carried[0].triggerAt?.toISOString()).toBe('2026-07-26T23:00:00.000Z');
  });
});

describe('reminder re-arming on due date change', () => {
  it('recomputes RELATIVE triggerAt and resets delivery state', async () => {
    const task = await createTask(
      { content: `rearm ${RUN}`, projectId: projectAId, dueDate: '2026-08-01' },
      userId,
    );
    const reminder = await createReminder(
      { taskId: task.id, type: 'RELATIVE', minutesBefore: 30 },
      userId,
    );
    // Simulate an already-fired reminder.
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { isSent: true, sentAt: new Date(), attempts: 2 },
    });

    await updateTask(task.id, { dueDate: '2026-08-10' }, userId);

    // The recompute runs as a fire-and-forget side effect.
    await new Promise((r) => setTimeout(r, 150));

    const rearmed = await prisma.reminder.findUniqueOrThrow({
      where: { id: reminder.id },
    });
    expect(rearmed.triggerAt?.toISOString()).toBe('2026-08-09T23:30:00.000Z');
    expect(rearmed.isSent).toBe(false);
    expect(rearmed.sentAt).toBeNull();
    expect(rearmed.attempts).toBe(0);
  });
});
