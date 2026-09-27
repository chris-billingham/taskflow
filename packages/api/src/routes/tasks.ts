import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createTaskSchema,
  updateTaskSchema,
  taskParamsSchema,
  taskQuerySchema,
  bulkTaskSchema,
  quickAddSchema,
  moveTaskSchema,
  reorderTasksSchema,
  taskSchema,
  taskListItemSchema,
  taskDetailSchema,
  bulkResultSchema,
  trashedTaskSchema,
  messageResponse,
  ok,
  page,
} from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import * as taskService from '../services/taskService.js';

const tags = ['Tasks'];

export async function taskRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.get(
    '/',
    {
      schema: {
        tags,
        summary: 'List tasks you can see, a page at a time',
        querystring: taskQuerySchema,
        response: { 200: page(taskListItemSchema) },
      },
    },
    async (request) => {
      const { tasks, nextCursor } = await taskService.getTasks(request.query, request.user.id);
      return { success: true as const, data: tasks, nextCursor };
    },
  );

  app.post(
    '/',
    {
      schema: { tags, summary: 'Create a task', body: createTaskSchema, response: { 201: ok(taskSchema) } },
    },
    async (request, reply) =>
      reply.status(201).send({
        success: true,
        data: await taskService.createTask(request.body, request.user.id),
      }),
  );

  app.post(
    '/quick-add',
    {
      schema: {
        tags,
        summary: 'Create a task from natural language ("Pay rent tomorrow p1 #Home")',
        body: quickAddSchema,
        response: { 201: ok(taskSchema) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        success: true,
        data: await taskService.quickAddTask(request.body.text, request.body.projectId, request.user.id, {
          dueDate: request.body.dueDate,
          dueTime: request.body.dueTime,
          sectionId: request.body.sectionId,
          defaultDueDate: request.body.defaultDueDate,
          defaultDueTime: request.body.defaultDueTime,
        }),
      }),
  );

  app.post(
    '/bulk',
    {
      schema: {
        tags,
        summary: 'Complete, reopen, delete, move or reprioritise up to 100 tasks',
        body: bulkTaskSchema,
        response: { 200: bulkResultSchema },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await taskService.bulkUpdate(request.body, request.user.id)),
    }),
  );

  app.put(
    '/reorder',
    {
      schema: { tags, summary: 'Reorder tasks', body: reorderTasksSchema, response: { 200: messageResponse } },
    },
    async (request) => ({
      success: true as const,
      ...(await taskService.reorderTasks(request.body.taskIds, request.user.id)),
    }),
  );

  app.get(
    '/:id',
    {
      schema: {
        tags,
        summary: 'Get a task with its project, section, parent and latest comments',
        params: taskParamsSchema,
        response: { 200: ok(taskDetailSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await taskService.getTaskById(request.params.id, request.user.id),
    }),
  );

  app.patch(
    '/:id',
    {
      schema: {
        tags,
        summary: 'Update a task',
        params: taskParamsSchema,
        body: updateTaskSchema,
        response: { 200: ok(taskSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await taskService.updateTask(request.params.id, request.body, request.user.id),
    }),
  );

  app.delete(
    '/:id',
    {
      schema: {
        tags,
        summary: 'Move a task and its subtasks to the trash (restorable for 30 days)',
        params: taskParamsSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await taskService.deleteTask(request.params.id, request.user.id)),
    }),
  );

  app.get(
    '/trash',
    {
      schema: {
        tags,
        summary: 'Tasks in the trash, newest first',
        response: { 200: ok(z.array(trashedTaskSchema)) },
      },
    },
    async (request) => ({ success: true as const, data: await taskService.getTrash(request.user.id) }),
  );

  app.post(
    '/:id/restore',
    {
      schema: {
        tags,
        summary: 'Restore a task from the trash, with the subtasks trashed with it',
        params: taskParamsSchema,
        response: { 200: ok(taskSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await taskService.restoreTask(request.params.id, request.user.id),
    }),
  );

  app.delete(
    '/:id/permanent',
    {
      schema: {
        tags,
        summary: 'Delete a trashed task permanently',
        params: taskParamsSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await taskService.purgeTask(request.params.id, request.user.id)),
    }),
  );

  app.post(
    '/:id/complete',
    {
      schema: {
        tags,
        summary: 'Complete a task (a recurring task returns its next occurrence)',
        params: taskParamsSchema,
        response: { 200: ok(taskSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await taskService.completeTask(request.params.id, request.user.id),
    }),
  );

  app.post(
    '/:id/uncomplete',
    {
      schema: { tags, summary: 'Reopen a completed task', params: taskParamsSchema, response: { 200: ok(taskSchema) } },
    },
    async (request) => ({
      success: true as const,
      data: await taskService.uncompleteTask(request.params.id, request.user.id),
    }),
  );

  app.post(
    '/:id/move',
    {
      schema: {
        tags,
        summary: 'Move a task to another project, section or parent',
        params: taskParamsSchema,
        body: moveTaskSchema,
        response: { 200: ok(taskSchema) },
      },
    },
    async (request) => ({
      success: true as const,
      data: await taskService.moveTask(request.params.id, request.body, request.user.id),
    }),
  );

  app.post(
    '/:id/duplicate',
    {
      schema: {
        tags,
        summary: 'Duplicate a task with its labels and subtasks',
        params: taskParamsSchema,
        response: { 201: ok(taskSchema) },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        success: true,
        data: await taskService.duplicateTask(request.params.id, request.user.id),
      }),
  );
}
