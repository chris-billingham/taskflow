import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { generateAccessToken } from '../../utils/jwt.js';

vi.mock('../../services/projectService.js', () => ({
  getUserProjects: vi.fn(),
  createProject: vi.fn(),
  getProjectById: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  duplicateProject: vi.fn(),
  archiveProject: vi.fn(),
  reorderProjects: vi.fn(),
  addProjectMember: vi.fn(),
  removeProjectMember: vi.fn(),
}));

import * as projectService from '../../services/projectService.js';
import { projectRoutes } from '../../routes/projects.js';
import { NotFoundError, ForbiddenError } from '../../errors/index.js';

const TEST_USER = { id: 'user-proj-test', email: 'proj@example.com', name: 'Project Tester' };
const AUTH_TOKEN = generateAccessToken(TEST_USER);

const SAMPLE_PROJECT = {
  id: 'proj-1',
  name: 'Work',
  description: null,
  color: '#6366f1',
  icon: null,
  ownerId: TEST_USER.id,
  isInbox: false,
  isArchived: false,
  isFavorite: false,
  viewStyle: 'LIST',
  sortOrder: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string; validation?: unknown }, _request, reply) => {
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        success: false,
        error: error.code ?? 'ERROR',
        message: error.message,
      });
    }
    return reply.status(500).send({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: error.message,
    });
  });

  await app.register(projectRoutes, { prefix: '/api/v1/projects' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function authHeaders() {
  return { Authorization: `Bearer ${AUTH_TOKEN}` };
}

describe('GET /api/v1/projects', () => {
  it('returns 200 with project list', async () => {
    vi.mocked(projectService.getUserProjects).mockResolvedValue([SAMPLE_PROJECT] as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Work');
  });

  it('returns 401 without auth', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/projects' });
    expect(response.statusCode).toBe(401);
  });

  it('calls service with the authenticated user id', async () => {
    vi.mocked(projectService.getUserProjects).mockResolvedValue([] as never);
    await app.inject({ method: 'GET', url: '/api/v1/projects', headers: authHeaders() });
    expect(projectService.getUserProjects).toHaveBeenCalledWith(TEST_USER.id);
  });
});

describe('POST /api/v1/projects', () => {
  it('returns 201 with created project', async () => {
    vi.mocked(projectService.createProject).mockResolvedValue(SAMPLE_PROJECT as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders(),
      payload: { name: 'Work', color: '#6366f1' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Work');
  });

  it('returns 400 for missing name', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders(),
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/v1/projects/:id', () => {
  it('returns 200 with project', async () => {
    vi.mocked(projectService.getProjectById).mockResolvedValue(SAMPLE_PROJECT as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/proj-1',
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.id).toBe('proj-1');
  });

  it('returns 404 when project not found', async () => {
    vi.mocked(projectService.getProjectById).mockRejectedValue(
      new NotFoundError('Project not found'),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/not-found',
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 403 when user lacks access', async () => {
    vi.mocked(projectService.getProjectById).mockRejectedValue(
      new ForbiddenError('You do not have access to this project'),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/other-project',
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('PATCH /api/v1/projects/:id', () => {
  it('returns 200 with updated project', async () => {
    const updated = { ...SAMPLE_PROJECT, name: 'Updated Work' };
    vi.mocked(projectService.updateProject).mockResolvedValue(updated as never);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/projects/proj-1',
      headers: authHeaders(),
      payload: { name: 'Updated Work' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.name).toBe('Updated Work');
  });
});

describe('DELETE /api/v1/projects/:id', () => {
  it('returns 200 on successful deletion', async () => {
    vi.mocked(projectService.deleteProject).mockResolvedValue({ message: 'Project deleted' } as never);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/projects/proj-1',
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });
});
