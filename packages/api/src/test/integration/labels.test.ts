import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './buildTestApp.js';
import { buildApp } from '../../app.js';
import { generateAccessToken } from '../../utils/jwt.js';

vi.mock('../../services/labelService.js', () => ({
  getUserLabels: vi.fn(),
  createLabel: vi.fn(),
  updateLabel: vi.fn(),
  deleteLabel: vi.fn(),
  reorderLabels: vi.fn(),
}));

import * as labelService from '../../services/labelService.js';

const USER = { id: 'user-1', email: 'ada@example.com', name: 'Ada' };
const headers = { authorization: `Bearer ${generateAccessToken(USER)}` };

// What Prisma hands back: Dates, plus anything else the row happens to carry.
const ROW = {
  id: 'label-1',
  name: 'errands',
  color: '#6B7280',
  userId: USER.id,
  isFavorite: false,
  sortOrder: 0,
  createdAt: new Date('2026-09-01T09:00:00.000Z'),
  updatedAt: new Date('2026-09-02T09:00:00.000Z'),
};

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('labels routes — contract', () => {
  it('sends dates as ISO strings', async () => {
    vi.mocked(labelService.getUserLabels).mockResolvedValue([ROW]);

    const res = await app.inject({ method: 'GET', url: '/api/v1/labels', headers });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: [{ ...ROW, createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-02T09:00:00.000Z' }],
    });
  });

  it('drops fields the contract does not list', async () => {
    vi.mocked(labelService.getUserLabels).mockResolvedValue([
      { ...ROW, internalNote: 'not for clients' } as typeof ROW,
    ]);

    const res = await app.inject({ method: 'GET', url: '/api/v1/labels', headers });

    expect(res.json().data[0]).not.toHaveProperty('internalNote');
  });

  it('fails loudly (outside production) when a route breaks its contract', async () => {
    vi.mocked(labelService.getUserLabels).mockResolvedValue([
      { ...ROW, isFavorite: 'yes' } as unknown as typeof ROW,
    ]);

    const res = await app.inject({ method: 'GET', url: '/api/v1/labels', headers });

    expect(res.statusCode).toBe(500);
    expect(res.json().message).toMatch(/does not match its contract/);
  });

  it('validates the body and reports the schema message', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/labels',
      headers,
      payload: { color: '#fff' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: 'VALIDATION_ERROR' });
    expect(res.json().message).not.toMatch(/^body\//);
    expect(labelService.createLabel).not.toHaveBeenCalled();
  });

  it('passes the parsed body and params to the service', async () => {
    vi.mocked(labelService.updateLabel).mockResolvedValue({ ...ROW, name: 'shopping' });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/labels/label-1',
      headers,
      payload: { name: 'shopping' },
    });

    expect(res.statusCode).toBe(200);
    expect(labelService.updateLabel).toHaveBeenCalledWith('label-1', { name: 'shopping' }, USER.id);
  });
});

describe('generated OpenAPI', () => {
  it('documents converted routes from their schemas', async () => {
    const docsApp = await buildApp({ logger: false, rateLimitRedis: false, docs: true });
    await docsApp.ready();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spec = docsApp.swagger() as unknown as { paths: Record<string, Record<string, any>> };
    await docsApp.close();

    const list = spec.paths['/api/v1/labels/'].get;
    const item = list.responses['200'].content['application/json'].schema.properties.data.items;
    expect(item.properties.createdAt).toMatchObject({ type: 'string', format: 'date-time' });
    expect(spec.paths['/api/v1/labels/'].post.requestBody).toBeDefined();
  });
});
