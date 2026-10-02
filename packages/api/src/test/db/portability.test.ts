import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Readable } from 'node:stream';
import { unzipSync } from 'fflate';
import type { FastifyInstance } from 'fastify';

// Object storage in memory: CI's database job has no S3 server.
const stored = vi.hoisted(() => new Map<string, Buffer>());
vi.mock('../../config/storage.js', () => ({
  uploadObject: async (key: string, body: Buffer) => void stored.set(key, body),
  getObjectStream: async (key: string) => ({ body: Readable.from([stored.get(key)!]), contentLength: stored.get(key)?.length }),
  deleteObject: async (key: string) => void stored.delete(key),
  deleteObjects: async (keys: string[]) => keys.forEach((k) => stored.delete(k)),
  ensureBucketExists: async () => {},
  createPresignedUrl: async () => 'http://storage.test/x',
}));

import { prisma } from '../../config/database.js';
import { buildTestApp } from '../integration/buildTestApp.js';
import { generateAccessToken } from '../../utils/jwt.js';
import { uploadFile } from '../../services/fileService.js';
import { dbFixtures } from './fixtures.js';

const fx = dbFixtures('portability');
let app: FastifyInstance;
let alice: { id: string; email: string; name: string };
let bob: { id: string; email: string; name: string };
const auth = (u: { id: string; email: string; name: string }) => ({
  authorization: `Bearer ${generateAccessToken({ id: u.id, email: u.email, name: u.name })}`,
});
// A 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** POST a file as multipart/form-data, as the browser does. */
function upload(user: typeof alice, filename: string, body: Buffer | string, type = 'application/octet-stream') {
  const boundary = '----taskflowtest';
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
    Buffer.isBuffer(body) ? body : Buffer.from(body),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method: 'POST',
    url: '/api/v1/settings/import',
    headers: { ...auth(user), 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload,
  });
}

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
  alice = await fx.user('alice');
  bob = await fx.user('bob');
  for (const u of [alice, bob]) await prisma.project.create({ data: { name: 'Inbox', ownerId: u.id, isInbox: true } });

  const garden = await prisma.project.create({ data: { name: 'Garden', ownerId: alice.id, color: '#10B981', viewStyle: 'BOARD' } });
  const spring = await prisma.section.create({ data: { name: 'Spring', projectId: garden.id } });
  const label = await prisma.label.create({ data: { name: 'outdoor', color: '#F59E0B', userId: alice.id } });
  const parent = await prisma.task.create({
    data: {
      content: 'Plant tomatoes', projectId: garden.id, sectionId: spring.id, creatorId: alice.id, priority: 1,
      dueDate: new Date('2026-10-05T00:00:00Z'), dueTime: '09:30', duration: 60, deadline: new Date('2026-10-09T00:00:00Z'),
      taskLabels: { create: { labelId: label.id } },
    },
  });
  await prisma.task.create({ data: { content: 'Buy seeds', projectId: garden.id, parentId: parent.id, creatorId: alice.id } });
  await prisma.task.create({
    data: { content: 'Water', projectId: garden.id, creatorId: alice.id, isRecurring: true, recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO', dueDate: new Date('2026-10-05T00:00:00Z') },
  });
  await prisma.comment.create({ data: { content: 'Use the big pots', authorId: alice.id, taskId: parent.id } });
  await uploadFile(PNG, 'plan.png', 'image/png', alice.id, parent.id);
  const inbox = await prisma.project.findFirstOrThrow({ where: { ownerId: alice.id, isInbox: true } });
  await prisma.task.create({ data: { content: 'Call the plumber', projectId: inbox.id, creatorId: alice.id } });
  await prisma.filter.create({ data: { name: 'Urgent', query: 'p1', userId: alice.id } });
});
afterAll(async () => {
  await prisma.project.deleteMany({ where: { ownerId: { in: [alice.id, bob.id] } } });
  await app.close();
  await fx.cleanup();
  await prisma.$disconnect();
});

describe('export', () => {
  it('describes projects with sections, subtasks, recurrence, labels, comments and attachments', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/settings/export?format=json', headers: auth(alice) });
    expect(res.statusCode).toBe(200);
    const doc = res.json();
    expect(doc).toMatchObject({ format: 'taskflow-export', version: 1 });
    const garden = doc.projects.find((p: { name: string }) => p.name === 'Garden');
    expect(garden).toMatchObject({ color: '#10B981', viewStyle: 'BOARD', sections: [{ name: 'Spring' }] });
    const tomatoes = garden.tasks.find((t: { content: string }) => t.content === 'Plant tomatoes');
    expect(tomatoes).toMatchObject({
      priority: 1, dueDate: '2026-10-05', dueTime: '09:30', duration: 60, deadline: '2026-10-09', labels: ['outdoor'],
      comments: [{ content: 'Use the big pots', author: alice.email }],
      attachments: [{ filename: 'plan.png', mimeType: 'image/png' }],
    });
    expect(garden.tasks.find((t: { content: string }) => t.content === 'Buy seeds').parentRef).toBe(tomatoes.ref);
    expect(garden.tasks.find((t: { content: string }) => t.content === 'Water').recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=MO');
    expect(doc.filters).toEqual([{ name: 'Urgent', query: 'p1', color: expect.any(String) }]);
  });

  it('downloads as a ZIP with the attachments’ files', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/settings/export', headers: auth(alice) });
    expect(res.headers['content-type']).toBe('application/zip');
    const files = unzipSync(new Uint8Array(res.rawPayload));
    expect(Object.keys(files)).toContain('export.json');
    const png = Object.entries(files).find(([name]) => name.endsWith('/plan.png'));
    expect(Buffer.from(png![1]).equals(PNG)).toBe(true);
  });
});

describe('import', () => {
  it('a Taskflow export recreates everything for someone else', async () => {
    const zip = (await app.inject({ method: 'GET', url: '/api/v1/settings/export', headers: auth(alice) })).rawPayload;
    const res = await upload(bob, 'taskflow-export.zip', zip, 'application/zip');
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ projects: 1, sections: 1, tasks: 4, comments: 1, attachments: 1, labels: 1, filters: 1, warnings: [] });

    const garden = await prisma.project.findFirstOrThrow({
      where: { ownerId: bob.id, name: 'Garden' },
      include: { sections: true, tasks: { include: { taskLabels: { include: { label: true } }, comments: true, attachments: true } } },
    });
    expect(garden).toMatchObject({ color: '#10B981', viewStyle: 'BOARD' });
    const tomatoes = garden.tasks.find((t) => t.content === 'Plant tomatoes')!;
    expect(tomatoes).toMatchObject({ priority: 1, dueTime: '09:30', duration: 60, sectionId: garden.sections[0].id, creatorId: bob.id });
    expect(tomatoes.dueDate?.toISOString().slice(0, 10)).toBe('2026-10-05');
    expect(tomatoes.taskLabels.map((tl) => tl.label.name)).toEqual(['outdoor']);
    // Bob didn't write the comment, so it says who did.
    expect(tomatoes.comments[0].content).toBe(`*From ${alice.email}:*\n\nUse the big pots`);
    expect(stored.get(tomatoes.attachments[0].url)?.equals(PNG)).toBe(true);
    expect(garden.tasks.find((t) => t.content === 'Buy seeds')!.parentId).toBe(tomatoes.id);
    expect(garden.tasks.find((t) => t.content === 'Water')).toMatchObject({ isRecurring: true, recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO' });
    // Inbox tasks land in Bob's own Inbox.
    const inbox = await prisma.project.findFirstOrThrow({ where: { ownerId: bob.id, isInbox: true }, include: { tasks: true } });
    expect(inbox.tasks.map((t) => t.content)).toContain('Call the plumber');
  });

  it('reads a Todoist CSV: sections, subtasks, labels, comments and dates', async () => {
    const csv = [
      'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DURATION,DURATION_UNIT,DEADLINE,DEADLINE_LANG',
      'meta,view_style,board,,,,,,,,,,,',
      'section,Kitchen,,,,,,,,,,,,',
      'task,Fix the tap @house @urgent,Washer is worn,1,1,Sam (1),,every monday,en,Europe/London,30,minute,2026-10-20,en',
      'task,Buy a washer,,4,2,Sam (1),,2026-10-04,en,Europe/London,,,,',
      'note,Hardware shop on Main St,,,,Sam (1),,,,,,,,',
    ].join('\n');
    const res = await upload(bob, 'Home [2203306141].csv', csv, 'text/csv');
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ projects: 1, sections: 1, tasks: 2, comments: 1 });

    const home = await prisma.project.findFirstOrThrow({
      where: { ownerId: bob.id, name: 'Home' },
      include: { tasks: { include: { taskLabels: { include: { label: true } }, comments: true } } },
    });
    expect(home.viewStyle).toBe('BOARD');
    const tap = home.tasks.find((t) => t.content === 'Fix the tap')!;
    expect(tap).toMatchObject({ description: 'Washer is worn', priority: 1, isRecurring: true, duration: 30 });
    expect(tap.recurrenceRule).toMatch(/FREQ=WEEKLY/);
    expect(tap.deadline?.toISOString().slice(0, 10)).toBe('2026-10-20');
    expect(tap.taskLabels.map((tl) => tl.label.name).sort()).toEqual(['house', 'urgent']);
    const washer = home.tasks.find((t) => t.content === 'Buy a washer')!;
    expect(washer.parentId).toBe(tap.id);
    expect(washer.comments[0].content).toBe('*From Sam (1):*\n\nHardware shop on Main St');
  });

  it('reads a plain CSV, one project per value of a project column', async () => {
    const csv = 'Content,Project,Section,Due date,Priority,Labels,Completed\nBook flights,Trip,,2026-11-01,p2,"travel, admin",\nPack,Trip,Before,,,,yes\nRenew passport,Admin,,,,,\n';
    const res = await upload(bob, 'tasks.csv', csv, 'text/csv');
    expect(res.json().data).toMatchObject({ projects: 2, tasks: 3 });
    const trip = await prisma.project.findFirstOrThrow({ where: { ownerId: bob.id, name: 'Trip' }, include: { tasks: true } });
    expect(trip.tasks.find((t) => t.content === 'Book flights')).toMatchObject({ priority: 2 });
    expect(trip.tasks.find((t) => t.content === 'Pack')).toMatchObject({ isCompleted: true });
  });

  it('explains files it can’t read', async () => {
    const res = await upload(bob, 'notes.pdf', '%PDF-1.4', 'application/pdf');
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Taskflow export/);
    const bad = await upload(bob, 'export.json', '{"format":"something-else"}', 'application/json');
    expect(bad.statusCode).toBe(400);
  });
});
