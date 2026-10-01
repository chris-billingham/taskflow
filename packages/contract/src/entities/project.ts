import { z } from 'zod';
import { id, instant, type Wire } from '../common.js';
import { memberSummarySchema } from './user.js';

export const viewStyleSchema = z.enum(['LIST', 'BOARD', 'CALENDAR']);

export const sectionSchema = z.object({
  id,
  name: z.string(),
  projectId: id,
  sortOrder: z.number().int(),
  isCollapsed: z.boolean(),
  version: z.number().int(),
  createdAt: instant,
  updatedAt: instant,
  /** Incomplete tasks in the section, where the endpoint counts them. */
  _count: z.object({ tasks: z.number().int() }).optional(),
});
export type Section = Wire<typeof sectionSchema>;

/** A project's own fields, as archive/unarchive return it. */
export const projectFieldsSchema = z.object({
  id,
  name: z.string(),
  color: z.string(),
  description: z.string().nullable(),
  ownerId: id.nullable(),
  workspaceId: id.nullable(),
  parentId: id.nullable(),
  viewStyle: viewStyleSchema,
  isFavorite: z.boolean(),
  isArchived: z.boolean(),
  isInbox: z.boolean(),
  sortOrder: z.number().int(),
  version: z.number().int(),
  createdAt: instant,
  updatedAt: instant,
});
export type ProjectFields = Wire<typeof projectFieldsSchema>;

/** A project with its sections, open-task count and sub-projects. */
export const projectSchema = projectFieldsSchema.extend({
  sections: z.array(sectionSchema),
  /** Incomplete tasks. */
  _count: z.object({ tasks: z.number().int() }),
  /** Sub-projects; the detail endpoint includes their name and color. */
  children: z.array(
    z.object({ id, name: z.string().optional(), color: z.string().optional() }),
  ),
});
export type Project = Wire<typeof projectSchema>;

export const projectRoleSchema = z.enum(['ADMIN', 'MEMBER', 'COMMENTER', 'VIEWER']);
export type ProjectRole = Wire<typeof projectRoleSchema>;

/** Someone a project is shared with directly. */
export const projectCollaboratorSchema = z.object({
  user: memberSummarySchema,
  role: projectRoleSchema,
  addedAt: instant,
});
export type ProjectCollaborator = Wire<typeof projectCollaboratorSchema>;

/** Who a project is shared with, for its Share dialog. */
export const projectSharingSchema = z.object({
  owner: memberSummarySchema.nullable(),
  /** The workspace whose members (except guests) all see the project. */
  workspace: z.object({ id, name: z.string() }).nullable(),
  collaborators: z.array(projectCollaboratorSchema),
  /** Whether you may add, change or remove people (project admins). */
  canManage: z.boolean(),
});
export type ProjectSharing = Wire<typeof projectSharingSchema>;
