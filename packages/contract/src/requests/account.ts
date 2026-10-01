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
