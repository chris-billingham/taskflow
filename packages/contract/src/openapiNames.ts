import { z } from 'zod';
import { errorResponseSchema } from './common.js';
import { authUserSchema, signedInSchema, twoFactorChallengeSchema, sessionSchema, apiTokenSchema, createdApiTokenSchema, profileSchema, meSchema, notificationPreferencesSchema } from './entities/account.js';
import { activitySchema } from './entities/activity.js';
import { attachmentSchema } from './entities/attachment.js';
import { commentSchema } from './entities/comment.js';
import { filterSchema } from './entities/filter.js';
import { labelSchema } from './entities/label.js';
import { notificationSchema } from './entities/notification.js';
import { projectFieldsSchema, projectSchema, sectionSchema, projectCollaboratorSchema, projectSharingSchema } from './entities/project.js';
import { reminderSchema } from './entities/reminder.js';
import { syncSchema, syncTaskSchema } from './entities/sync.js';
import { taskFieldsSchema, taskListItemSchema, taskSchema, taskDetailSchema, subtaskSchema, taskLabelSchema, trashedTaskSchema } from './entities/task.js';
import { userSummarySchema, memberSummarySchema } from './entities/user.js';
import { workspaceSummarySchema, workspaceSchema, workspaceMemberSchema } from './entities/workspace.js';

// Names for the schemas clients use most. The OpenAPI document lists them
// once under components.schemas and refers to them, instead of inlining a copy
// in every operation, so generated clients (the Swift one) get real types:
// Components.Schemas.Task rather than an anonymous nested struct.
const names: [z.ZodType, string][] = [
  [errorResponseSchema, 'ErrorResponse'],
  [authUserSchema, 'AuthUser'],
  [signedInSchema, 'SignedIn'],
  [twoFactorChallengeSchema, 'TwoFactorChallenge'],
  [sessionSchema, 'Session'],
  [apiTokenSchema, 'ApiToken'],
  [createdApiTokenSchema, 'CreatedApiToken'],
  [profileSchema, 'Profile'],
  [meSchema, 'Me'],
  [notificationPreferencesSchema, 'NotificationPreferences'],
  [activitySchema, 'Activity'],
  [attachmentSchema, 'Attachment'],
  [commentSchema, 'Comment'],
  [filterSchema, 'Filter'],
  [labelSchema, 'Label'],
  [notificationSchema, 'Notification'],
  [projectFieldsSchema, 'ProjectFields'],
  [projectSchema, 'Project'],
  [sectionSchema, 'Section'],
  [projectCollaboratorSchema, 'ProjectCollaborator'],
  [projectSharingSchema, 'ProjectSharing'],
  [reminderSchema, 'Reminder'],
  [syncSchema, 'SyncPayload'],
  [syncTaskSchema, 'SyncTask'],
  [taskFieldsSchema, 'TaskFields'],
  [taskLabelSchema, 'TaskLabel'],
  [subtaskSchema, 'Subtask'],
  [taskListItemSchema, 'TaskListItem'],
  [taskSchema, 'Task'],
  [taskDetailSchema, 'TaskDetail'],
  [trashedTaskSchema, 'TrashedTask'],
  [userSummarySchema, 'UserSummary'],
  [memberSummarySchema, 'MemberSummary'],
  [workspaceSummarySchema, 'WorkspaceSummary'],
  [workspaceSchema, 'Workspace'],
  [workspaceMemberSchema, 'WorkspaceMember'],
];
for (const [schema, id] of names) {
  if (!z.globalRegistry.has(schema)) z.globalRegistry.add(schema, { id });
}
