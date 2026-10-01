import { z } from 'zod';
import { dateFormatSchema, emailFrequencySchema, themeSchema, timeFormatSchema } from '../common.js';

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * PATCH /users/me and PATCH /settings/preferences. One schema for both: they
 * had drifted (theme was an enum on one and free text on the other).
 */
export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarUrl: z.url().nullable().optional(),
  timezone: z
    .string()
    .max(64)
    .refine(isValidTimeZone, 'Must be a valid IANA timezone (e.g. Europe/London)')
    .optional(),
  weekStart: z.number().int().min(0).max(6).optional(),
  dateFormat: dateFormatSchema.nullable().optional(),
  timeFormat: timeFormatSchema.nullable().optional(),
  theme: themeSchema.nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// REMINDER is deliberately absent: per-task reminders the user created
// themselves cannot be globally muted.
export const updateNotificationPreferencesSchema = z.object({
  emailEnabled: z.boolean().optional(),
  emailFrequency: emailFrequencySchema.optional(),
  disabledTypes: z
    .array(
      z.enum([
        'TASK_ASSIGNED',
        'TASK_DUE_SOON',
        'TASK_OVERDUE',
        'COMMENT_ON_TASK',
        'MENTION_IN_COMMENT',
        'PROJECT_SHARED',
        'WORKSPACE_INVITE',
      ]),
    )
    .max(7)
    .optional(),
});

/** POST /tokens. */
export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1, 'Give the token a name').max(100),
  /** READ: GET requests only. WRITE: reading and changing tasks, projects and so on. */
  scope: z.enum(['READ', 'WRITE']),
  /** Days until it stops working; omit for no expiry. */
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});
export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;

export const sessionParamsSchema = z.object({ id: z.string().min(1) });

/** POST /push/apple: the APNs device token the app got from iOS (hex). */
export const registerAppleDeviceSchema = z.object({
  token: z.string().regex(/^[0-9a-fA-F]{64,200}$/, 'Must be the hex device token from APNs'),
  /** SANDBOX for development builds, PRODUCTION for TestFlight and the App Store. */
  environment: z.enum(['SANDBOX', 'PRODUCTION']),
});
export type RegisterAppleDeviceInput = z.infer<typeof registerAppleDeviceSchema>;
export const appleDeviceParamsSchema = z.object({ token: z.string().min(1) });
