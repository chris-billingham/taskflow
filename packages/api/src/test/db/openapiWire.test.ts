import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Ajv } from 'ajv';
import ajvFormats from 'ajv-formats';
import { prisma } from '../../config/database.js';
import { buildApp } from '../../app.js';
import { generateAccessToken } from '../../utils/jwt.js';
import * as taskService from '../../services/taskService.js';
import { dbFixtures } from './fixtures.js';

// What the API sends must match what its OpenAPI document says, because the
// Swift client is generated from that document. The contract's codecs are
// documented by hand (calendar dates, mapped enums); this catches a mismatch
// like a date documented as a full timestamp, which would make every
// generated client fail to decode real responses.
const fx = dbFixtures('openapiwire');
let app: FastifyInstance;
let spec: { paths: Record<string, Record<string, any>>; components: { schemas: Record<string, unknown> } };
let ajv: Ajv;
let headers: Record<string, string>;
let projectId = '';

beforeAll(async () => {
  app = await buildApp({ logger: false, rateLimitRedis: false, docs: true });
  await app.ready();
  spec = app.swagger() as typeof spec;
  // OpenAPI 3.0 schemas: `nullable` is understood, unknown keywords allowed.
  ajv = new Ajv({ strict: false, allErrors: true });
  ajvFormats.default(ajv); // CommonJS module: the plugin is its default export
  ajv.addSchema({ components: openapi30ToAjv(spec.components) }, 'spec');

  const user = await fx.user('wire');
  headers = { authorization: `Bearer ${generateAccessToken({ id: user.id, email: user.email, name: user.name })}` };
  await prisma.user.update({ where: { id: user.id }, data: { dateFormat: 'DAY_FIRST', timeFormat: 'H24' } });
  projectId = (await prisma.project.create({ data: { name: 'Wire', ownerId: user.id } })).id;
  const task = await taskService.createTask(
    { content: 'Due soon', projectId, dueDate: '2026-10-05', deadline: '2026-10-09', priority: 2 },
    user.id,
  );
  await taskService.updateTask(task.id, { content: 'Due soon (edited)' }, user.id);
});
afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: projectId } });
  await app.close();
  await fx.cleanup();
  await prisma.$disconnect();
});

/**
 * Two OpenAPI 3.0 habits Ajv reads strictly: a nullable enum lists its values
 * without null, and `nullable` may appear with no type. Generated clients
 * treat both as optional values, so allow null the same way here.
 */
function openapi30ToAjv<T>(node: T): T {
  if (Array.isArray(node)) return node.map(openapi30ToAjv) as T;
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) out[k] = openapi30ToAjv(v);
  if (out.nullable === true) {
    if (Array.isArray(out.enum) && !out.enum.includes(null)) out.enum = [...out.enum, null];
    if (out.type === undefined) {
      // e.g. { nullable: true, allOf: [{ $ref }] } for an optional object.
      delete out.nullable;
      return { anyOf: [out, { type: 'null' }] } as T;
    }
  }
  return out as T;
}

/** Validate a real response body against the document's schema for that route. */
async function matchesDocument(method: 'get' | 'post' | 'patch', path: string, url: string, payload?: unknown) {
  const res = await app.inject({ method: method.toUpperCase() as 'GET', url, headers, payload: payload as never });
  expect(res.statusCode, res.body).toBeLessThan(300);
  const responses = spec.paths[path][method].responses;
  const schema = (responses['200'] ?? responses['201']).content['application/json'].schema;
  // Resolve component refs against the registered spec.
  const validate = ajv.compile(openapi30ToAjv(JSON.parse(JSON.stringify(schema).replaceAll('"#/components/', '"spec#/components/'))));
  const ok = validate(res.json());
  expect(ok, JSON.stringify(validate.errors?.slice(0, 3), null, 2)).toBe(true);
  return res.json();
}

describe('responses match the OpenAPI document', () => {
  it('sync', async () => {
    const body = await matchesDocument('get', '/api/v1/sync', '/api/v1/sync');
    expect(body.data.tasks[0].dueDate).toBe('2026-10-05');
  });

  it('a project’s tasks', async () => {
    await matchesDocument('get', '/api/v1/tasks', `/api/v1/tasks?projectId=${projectId}`);
  });

  it('your profile, with display preferences', async () => {
    const body = await matchesDocument('get', '/api/v1/users/me', '/api/v1/users/me');
    expect(body.data.dateFormat).toBe('dd/MM/yyyy');
  });

  it('projects and today', async () => {
    await matchesDocument('get', '/api/v1/projects', '/api/v1/projects');
    await matchesDocument('get', '/api/v1/views/today', '/api/v1/views/today');
  });
});
