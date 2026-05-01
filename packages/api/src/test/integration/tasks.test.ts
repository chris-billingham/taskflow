import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { generateAccessToken } from '../../utils/jwt.js';

vi.mock('../../services/taskService.js', () => ({
  getTasks: vi.fn(),
  createTask: vi.fn(),
  getTaskById: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  completeTask: vi.fn(),
  uncompleteTask: vi.fn(),
  quickAddTask: vi.fn(),
  bulkUpdate: vi.fn(),
  reorderTasks: vi.fn(),
  duplicateTask: vi.fn(),
  moveTask: vi.fn(),
}));

vi.mock('../../services/syncService.js', () => ({
  broadcastTaskCreated: vi.fn(),
  broadcastTaskUpdated: vi.fn(),
  broadcastTaskDeleted: vi.fn(),
}));

import * as taskService from '../../services/taskService.js';
import { taskRoutes } from '../../routes/tasks.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../errors/index.js';

const TEST_USER = { id: 'user-test-1', email: 'test@example.com', name: 'Test User' };
const AUTH_TOKEN = generateAccessToken(TEST_USER);

const SAMPLE_TASK = {
  id: 'task-1',
  content: 'Sample task',
  projectId: 'proj-1',
  creatorId: TEST_USER.id,
  isCompleted: false,
  priority: 4,
  taskLabels: [],
  subtasks: [],
  assignee: null,
  _count: { subtasks: 0, comments: 0 },
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

  await app.register(taskRoutes, { prefix: '/api/v1/tasks' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function authHeaders() {
  return { Authorization: `Bearer ${AUTH_TOKEN}` };
}

describe('GET /api/v1/tasks', () => {
  it('returns 200 with task list', async () => {
    vi.mocked(taskService.getTasks).mockResolvedValue([SAMPLE_TASK] as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tasks',
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('task-1');
  });

  it('returns 401 without auth token', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/tasks' });
    expect(response.statusCode).toBe(401);
  });

  it('passes query params to service', async () => {
    vi.mocked(taskService.getTasks).mockResolvedValue([] as never);

    await app.inject({
      method: 'GET',
      url: '/api/v1/tasks?projectId=proj-1&completed=false',
      headers: authHeaders(),
    });

    expect(taskService.getTasks).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj-1' }),
      TEST_USER.id,
    );
  });
});

describe('POST /api/v1/tasks', () => {
  it('returns 201 with created task', async () => {
    vi.mocked(taskService.createTask).mockResolvedValue(SAMPLE_TASK as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: authHeaders(),
      payload: { content: 'New task', projectId: 'proj-1' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.content).toBe('Sample task');
  });

  it('returns 400 for missing required content field', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: authHeaders(),
      payload: { projectId: 'proj-1' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for missing projectId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: authHeaders(),
      payload: { content: 'Task without project' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/v1/tasks/:id', () => {
  it('returns 200 with task', async () => {
    vi.mocked(taskService.getTaskById).mockResolvedValue(SAMPLE_TASK as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tasks/task-1',
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.id).toBe('task-1');
  });

  it('returns 404 when task not found', async () => {
    vi.mocked(taskService.getTaskById).mockRejectedValue(new NotFoundError('Task not found'));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tasks/non-existent',
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 403 when user lacks access', async () => {
    vi.mocked(taskService.getTaskById).mockRejectedValue(
      new ForbiddenError('You do not have access to this task'),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tasks/task-other',
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('PATCH /api/v1/tasks/:id', () => {
  it('returns 200 with updated task', async () => {
    const updated = { ...SAMPLE_TASK, content: 'Updated task' };
    vi.mocked(taskService.updateTask).mockResolvedValue(updated as never);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/tasks/task-1',
      headers: authHeaders(),
      payload: { content: 'Updated task' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.content).toBe('Updated task');
  });
});

describe('DELETE /api/v1/tasks/:id', () => {
  it('returns 200 on successful deletion', async () => {
    vi.mocked(taskService.deleteTask).mockResolvedValue({ message: 'Task deleted' } as never);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/tasks/task-1',
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });
});

describe('POST /api/v1/tasks/:id/complete', () => {
  it('returns 200 when task is completed', async () => {
    const completed = { ...SAMPLE_TASK, isCompleted: true };
    vi.mocked(taskService.completeTask).mockResolvedValue(completed as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks/task-1/complete',
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.isCompleted).toBe(true);
  });
});

describe('POST /api/v1/tasks/quick-add', () => {
  it('returns 201 with parsed task', async () => {
    vi.mocked(taskService.quickAddTask).mockResolvedValue(SAMPLE_TASK as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks/quick-add',
      headers: authHeaders(),
      payload: { text: 'Buy groceries p1 today', projectId: 'proj-1' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().success).toBe(true);
  });

  it('returns 400 when text is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks/quick-add',
      headers: authHeaders(),
      payload: { projectId: 'proj-1' },
    });
    expect(response.statusCode).toBe(400);
  });
});
