import type { WebhookEvent } from '@taskflow/contract';
import { WS_EVENTS, emitToProject, emitToWorkspace } from '../websocket/events.js';
import { logger } from '../config/logger.js';
import { publish } from './webhooks.js';

/** Webhooks hear about the same changes as open browsers. */
function toWebhooks(projectId: string, event: WebhookEvent, data: Record<string, unknown>): void {
  publish(projectId, event, data).catch((err) => logger.warn({ err, event }, 'could not queue webhook deliveries'));
}

export function broadcastTaskCreated(task: { projectId: string; [key: string]: unknown }): void {
  emitToProject(task.projectId, WS_EVENTS.TASK_CREATED, { task });
  toWebhooks(task.projectId, 'task.created', { task });
}

export function broadcastTaskUpdated(task: { projectId: string; [key: string]: unknown }): void {
  emitToProject(task.projectId, WS_EVENTS.TASK_UPDATED, { task });
  toWebhooks(task.projectId, 'task.updated', { task });
}

/** Completing or reopening: an update for browsers, its own event for webhooks. */
export function broadcastTaskCompletion(task: { projectId: string; isCompleted?: unknown; [key: string]: unknown }): void {
  emitToProject(task.projectId, WS_EVENTS.TASK_UPDATED, { task });
  toWebhooks(task.projectId, task.isCompleted ? 'task.completed' : 'task.uncompleted', { task });
}

export function broadcastTaskDeleted(taskId: string, projectId: string): void {
  emitToProject(projectId, WS_EVENTS.TASK_DELETED, { taskId, projectId });
  toWebhooks(projectId, 'task.deleted', { taskId, projectId });
}

export function broadcastProjectUpdated(project: {
  id: string;
  workspaceId?: string | null;
  [key: string]: unknown;
}): void {
  // Only what everyone shares: favourite, order and section collapse are each
  // viewer's own, so the actor's values must not overwrite anyone else's.
  const { isFavorite: _f, sortOrder: _s, sections: _sections, userSettings: _u, ...shared } = project;
  emitToProject(project.id, WS_EVENTS.PROJECT_UPDATED, { project: shared });
  if (project.workspaceId) {
    emitToWorkspace(project.workspaceId, WS_EVENTS.PROJECT_UPDATED, { project: shared });
  }
}

export function broadcastProjectDeleted(projectId: string, workspaceId?: string | null): void {
  emitToProject(projectId, WS_EVENTS.PROJECT_DELETED, { projectId });
  if (workspaceId) {
    emitToWorkspace(workspaceId, WS_EVENTS.PROJECT_DELETED, { projectId });
  }
}

/** A project's tasks in a new order (sortOrder = position). */
export function broadcastTasksReordered(projectId: string, order: { id: string; sortOrder: number }[]): void {
  emitToProject(projectId, WS_EVENTS.TASKS_REORDERED, { projectId, order });
}

export function broadcastSectionsReordered(projectId: string): void {
  emitToProject(projectId, WS_EVENTS.SECTIONS_REORDERED, { projectId });
}

export function broadcastSectionCreated(section: {
  projectId: string;
  [key: string]: unknown;
}): void {
  emitToProject(section.projectId, WS_EVENTS.SECTION_CREATED, { section });
}

export function broadcastSectionUpdated(section: {
  projectId: string;
  [key: string]: unknown;
}): void {
  const { isCollapsed: _c, userSettings: _u, ...shared } = section;
  emitToProject(section.projectId, WS_EVENTS.SECTION_UPDATED, { section: shared });
}

export function broadcastSectionDeleted(sectionId: string, projectId: string): void {
  emitToProject(projectId, WS_EVENTS.SECTION_DELETED, { sectionId, projectId });
}

export function broadcastCommentCreated(
  comment: { taskId?: string | null; [key: string]: unknown },
  projectId: string,
): void {
  emitToProject(projectId, WS_EVENTS.COMMENT_CREATED, { comment });
  toWebhooks(projectId, 'comment.created', { comment });
}

export function broadcastCommentUpdated(
  comment: { taskId?: string | null; [key: string]: unknown },
  projectId: string,
): void {
  emitToProject(projectId, WS_EVENTS.COMMENT_UPDATED, { comment });
}

export function broadcastCommentDeleted(
  commentId: string,
  taskId: string | null,
  projectId: string,
): void {
  emitToProject(projectId, WS_EVENTS.COMMENT_DELETED, { commentId, taskId });
  toWebhooks(projectId, 'comment.deleted', { commentId, taskId });
}
