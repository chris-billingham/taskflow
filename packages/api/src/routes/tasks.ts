import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import {
  createTaskSchema,
  updateTaskSchema,
  taskParamsSchema,
  taskQuerySchema,
  bulkTaskSchema,
  quickAddSchema,
  moveTaskSchema,
  reorderTasksSchema,
} from '../schemas/task.js';
import * as taskService from '../services/taskService.js';
import { ValidationError } from '../errors/index.js';

export async function taskRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/v1/tasks - List tasks with filters
  app.get('/', async (request, reply) => {
    const query = taskQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw new ValidationError(query.error.issues[0].message);
    }

    const { tasks, nextCursor } = await taskService.getTasks(query.data, request.user.id);
    return reply.send({ success: true, data: tasks, nextCursor });
  });

  // POST /api/v1/tasks - Create task
  app.post('/', async (request, reply) => {
    const result = createTaskSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await taskService.createTask(result.data, request.user.id);
    return reply.status(201).send({ success: true, data });
  });

  // POST /api/v1/tasks/quick-add - Quick add with natural language
  app.post('/quick-add', async (request, reply) => {
    const result = quickAddSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await taskService.quickAddTask(
      result.data.text,
      result.data.projectId,
      request.user.id,
    );
    return reply.status(201).send({ success: true, data });
  });

  // POST /api/v1/tasks/bulk - Bulk operations
  app.post('/bulk', async (request, reply) => {
    const result = bulkTaskSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await taskService.bulkUpdate(result.data, request.user.id);
    return reply.send({ success: true, ...data });
  });

  // PUT /api/v1/tasks/reorder - Reorder tasks
  app.put('/reorder', async (request, reply) => {
    const result = reorderTasksSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await taskService.reorderTasks(
      result.data.taskIds,
      request.user.id,
    );
    return reply.send({ success: true, ...data });
  });

  // GET /api/v1/tasks/:id - Get task details
  app.get('/:id', async (request, reply) => {
    const params = taskParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await taskService.getTaskById(params.data.id, request.user.id);
    return reply.send({ success: true, data });
  });

  // PATCH /api/v1/tasks/:id - Update task
  app.patch('/:id', async (request, reply) => {
    const params = taskParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const body = updateTaskSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await taskService.updateTask(
      params.data.id,
      body.data,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // DELETE /api/v1/tasks/:id - Delete task
  app.delete('/:id', async (request, reply) => {
    const params = taskParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await taskService.deleteTask(params.data.id, request.user.id);
    return reply.send({ success: true, ...data });
  });

  // POST /api/v1/tasks/:id/complete - Complete task
  app.post('/:id/complete', async (request, reply) => {
    const params = taskParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await taskService.completeTask(params.data.id, request.user.id);
    return reply.send({ success: true, data });
  });

  // POST /api/v1/tasks/:id/uncomplete - Uncomplete task
  app.post('/:id/uncomplete', async (request, reply) => {
    const params = taskParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await taskService.uncompleteTask(params.data.id, request.user.id);
    return reply.send({ success: true, data });
  });

  // POST /api/v1/tasks/:id/move - Move task
  app.post('/:id/move', async (request, reply) => {
    const params = taskParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const body = moveTaskSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0].message);
    }

    const data = await taskService.moveTask(
      params.data.id,
      body.data,
      request.user.id,
    );
    return reply.send({ success: true, data });
  });

  // POST /api/v1/tasks/:id/duplicate - Duplicate task
  app.post('/:id/duplicate', async (request, reply) => {
    const params = taskParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0].message);
    }

    const data = await taskService.duplicateTask(params.data.id, request.user.id);
    return reply.status(201).send({ success: true, data });
  });
}
