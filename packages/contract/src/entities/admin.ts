import { z } from 'zod';
import { id, instant, type Wire } from '../common.js';
import { systemRoleSchema, workspaceRoleSchema } from './account.js';

/** An account as the admin console lists it. */
export const adminUserSchema = z.object({
  id,
  email: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  role: systemRoleSchema,
  isActive: z.boolean(),
  emailVerified: z.boolean(),
  createdAt: instant,
  updatedAt: instant,
  lastLoginAt: instant.nullable(),
  twoFactorEnabledAt: instant.nullable(),
});
export type AdminUser = Wire<typeof adminUserSchema>;

export const adminUserPageSchema = z.object({
  users: z.array(adminUserSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  pages: z.number().int(),
});
export type AdminUserPage = Wire<typeof adminUserPageSchema>;

export const adminUserDetailSchema = adminUserSchema.extend({
  timezone: z.string(),
  workspaceMemberships: z.array(
    z.object({
      role: workspaceRoleSchema,
      joinedAt: instant,
      workspace: z.object({ id, name: z.string(), slug: z.string() }),
    }),
  ),
  _count: z.object({
    ownedWorkspaces: z.number().int(),
    ownedProjects: z.number().int(),
    createdTasks: z.number().int(),
    assignedTasks: z.number().int(),
  }),
});
export type AdminUserDetail = Wire<typeof adminUserDetailSchema>;

export const adminStatsSchema = z.object({
  total: z.number().int(),
  active: z.number().int(),
  suspended: z.number().int(),
  admins: z.number().int(),
  unverified: z.number().int(),
});
export type AdminStats = Wire<typeof adminStatsSchema>;

/** POST /admin/users. temporaryPassword is shown once, when generated. */
export const adminCreatedUserSchema = z.object({
  user: z.object({
    id,
    email: z.string(),
    name: z.string(),
    role: systemRoleSchema,
    isActive: z.boolean(),
    emailVerified: z.boolean(),
    createdAt: instant,
  }),
  temporaryPassword: z.string().nullable(),
});

export const adminPasswordResetSchema = z.object({
  temporaryPassword: z.string().nullable(),
  message: z.string(),
});

export const instanceSettingsSchema = z.object({
  registrationMode: z.enum(['invite', 'open']),
});

const checkResult = z.enum(['ok', 'error']);

/** GET /admin/system: the running release and the state of what it depends on. */
export const adminSystemSchema = z.object({
  version: z.string(),
  commit: z.string().nullable(),
  database: checkResult,
  redis: checkResult,
  worker: z.object({
    status: checkResult,
    lastSeen: instant.nullable(),
    version: z.string().nullable(),
  }),
  queues: z.array(
    z.object({
      name: z.string(),
      waiting: z.number().int(),
      active: z.number().int(),
      delayed: z.number().int(),
      failed: z.number().int(),
    }),
  ),
});
export type AdminSystem = Wire<typeof adminSystemSchema>;

/** A background job that ran out of attempts. */
export const adminFailedJobSchema = z.object({
  queue: z.string(),
  id: z.string(),
  name: z.string(),
  reason: z.string(),
  attempts: z.number().int(),
  failedAt: instant.nullable(),
});
export type AdminFailedJob = Wire<typeof adminFailedJobSchema>;
