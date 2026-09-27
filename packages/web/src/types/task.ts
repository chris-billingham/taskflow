import type { Subtask, TaskDetail, TaskListItem, TodayView, UpcomingView, UserSummary } from '@taskflow/contract';

/** The label parts task rows use; satisfied by full labels and filter results alike. */
export interface TaskLabel {
  taskId: string;
  labelId: string;
  label: { id: string; name: string; color: string };
}

export type TaskAssignee = UserSummary;

/**
 * A task as the web app handles it. Lists, views, filter results, the detail
 * endpoint and embedded subtasks each include slightly different parts, so the
 * parts only some of them send are optional here.
 */
export type Task = Omit<TaskListItem, 'taskLabels' | '_count'> & {
  taskLabels: TaskLabel[];
  _count?: TaskListItem['_count'];
  subtasks?: Subtask[];
  project?: TaskDetail['project'];
  section?: TaskDetail['section'];
  parent?: TaskDetail['parent'];
};

/**
 * An exact due date/time the caller already knows (a calendar cell, an
 * Upcoming day). The server uses it instead of anything parsed from the text.
 */
export interface QuickAddDue {
  dueDate?: string; // yyyy-MM-dd
  dueTime?: string; // HH:mm
}

/** Where a quick-add box sits: an exact due date/time and/or a section. */
export interface QuickAddContext extends QuickAddDue {
  sectionId?: string;
}

export interface CreateTaskInput {
  content: string;
  description?: string;
  projectId: string;
  sectionId?: string;
  parentId?: string;
  dueDate?: string;
  dueTime?: string;
  deadline?: string;
  duration?: number;
  priority?: number;
  assigneeId?: string;
  labelIds?: string[];
  isRecurring?: boolean;
  recurrenceRule?: string;
}

export interface MoveTaskInput {
  projectId?: string;
  sectionId?: string | null;
  parentId?: string | null;
}

export type TodayViewData = TodayView;
export type UpcomingViewData = UpcomingView;
