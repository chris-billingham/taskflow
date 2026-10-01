import { z } from 'zod';
import { dateFormatSchema, emailFrequencySchema, id, instant, ok, themeSchema, timeFormatSchema, type Wire } from '../common.js';
import { notificationTypeSchema } from './notification.js';

export const systemRoleSchema = z.enum(['USER', 'ADMIN']);
export const workspaceRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'GUEST']);
export type SystemRole = Wire<typeof systemRoleSchema>;
export type WorkspaceRole = Wire<typeof workspaceRoleSchema>;

/** The signed-in user as auth endpoints return them. */
export const authUserSchema = z.object({
  id,
  email: z.string(),
  name: z.string(),
  role: systemRoleSchema,
  isActive: z.boolean(),
});
export type AuthUser = Wire<typeof authUserSchema>;

/** POST /auth/login. The refresh token arrives as an httpOnly cookie. */
export const loginResponse = ok(z.object({ user: authUserSchema, accessToken: z.string() }));

/**
 * POST /auth/register. When the instance verifies email addresses there is no
 * session yet: the user must follow the emailed link, then sign in.
 */
export const registerResponse = ok(
  z.discriminatedUnion('verificationRequired', [
    z.object({ user: authUserSchema, verificationRequired: z.literal(true) }),
    z.object({ user: authUserSchema, accessToken: z.string(), verificationRequired: z.literal(false) }),
  ]),
);

/** POST /auth/refresh (reads and rotates the refresh cookie). */
export const refreshResponse = ok(z.object({ accessToken: z.string() }));

/** GET /auth/registration: whether the sign-in page should offer sign-up. */
export const registrationStatusSchema = z.object({
  mode: z.enum(['invite', 'open']),
  /** Also true on a brand-new install, whose first account is always allowed. */
  open: z.boolean(),
});

/** Your own profile and preferences. */
export const profileSchema = z.object({
  id,
  email: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  /** IANA timezone; every date calculation uses it. */
  timezone: z.string(),
  /** 0 = Sunday … 6 = Saturday. */
  weekStart: z.number().int(),
  dateFormat: dateFormatSchema.nullable(),
  timeFormat: timeFormatSchema.nullable(),
  theme: themeSchema.nullable(),
  role: systemRoleSchema,
  isActive: z.boolean(),
  emailVerified: z.boolean(),
  createdAt: instant,
  updatedAt: instant,
});
export type Profile = Wire<typeof profileSchema>;

/** GET /users/me: your profile plus the workspaces you belong to. */
export const meSchema = profileSchema.extend({
  workspaceMemberships: z.array(
    z.object({
      role: workspaceRoleSchema,
      workspace: z.object({ id, name: z.string(), slug: z.string() }),
    }),
  ),
});
export type Me = Wire<typeof meSchema>;

export const notificationPreferencesSchema = z.object({
  emailEnabled: z.boolean(),
  emailFrequency: emailFrequencySchema,
  /** Muted types, suppressed in-app, by push and by email. */
  disabledTypes: z.array(notificationTypeSchema),
});
export type NotificationPreferences = Wire<typeof notificationPreferencesSchema>;
