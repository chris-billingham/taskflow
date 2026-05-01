import { WS_EVENTS, emitToProject, emitToWorkspace } from '../websocket/events.js';

export function broadcastTaskCreated(task: { projectId: string; [key: string]: unknown }): void {
  emitToProject(task.projectId, WS_EVENTS.TASK_CREATED, { task });
}

export function broadcastTaskUpdated(task: { projectId: string; [key: string]: unknown }): void {
  emitToProject(task.projectId, WS_EVENTS.TASK_UPDATED, { task });
}

export function broadcastTaskDeleted(taskId: string, projectId: string): void {
  emitToProject(projectId, WS_EVENTS.TASK_DELETED, { taskId, projectId });
}

export function broadcastProjectUpdated(project: {
  id: string;
  workspaceId?: string | null;
  [key: string]: unknown;
}): void {
  emitToProject(project.id, WS_EVENTS.PROJECT_UPDATED, { project });
  if (project.workspaceId) {
    emitToWorkspace(project.workspaceId, WS_EVENTS.PROJECT_UPDATED, { project });
  }
}

export function broadcastProjectDeleted(projectId: string, workspaceId?: string | null): void {
  emitToProject(projectId, WS_EVENTS.PROJECT_DELETED, { projectId });
  if (workspaceId) {
    emitToWorkspace(workspaceId, WS_EVENTS.PROJECT_DELETED, { projectId });
  }
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
  emitToProject(section.projectId, WS_EVENTS.SECTION_UPDATED, { section });
}

export function broadcastSectionDeleted(sectionId: string, projectId: string): void {
  emitToProject(projectId, WS_EVENTS.SECTION_DELETED, { sectionId, projectId });
}

export function broadcastCommentCreated(
  comment: { taskId?: string | null; [key: string]: unknown },
  projectId: string,
): void {
  emitToProject(projectId, WS_EVENTS.COMMENT_CREATED, { comment });
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
}
