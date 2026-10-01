import { z } from 'zod';
import { dateFormatSchema, emailAddress, timeFormatSchema } from '../common.js';
import { isValidTimeZone } from './account.js';

/**
 * Starting preferences read from the browser at sign-up. Anything invalid is
 * dropped rather than failing the sign-up: the column defaults apply instead.
 */
const signUpPreferencesSchema = z.object({
  timezone: z.string().max(64).refine(isValidTimeZone).optional().catch(undefined),
  weekStart: z.union([z.literal(0), z.literal(1), z.literal(6)]).optional().catch(undefined),
  dateFormat: dateFormatSchema.optional().catch(undefined),
  timeFormat: timeFormatSchema.optional().catch(undefined),
});

/**
 * How a client keeps its session. The web app (`web`, the default) gets the
 * refresh token as an httpOnly cookie. Native apps and other non-browser
 * clients (`app`) get it in the response body and send it back in the body
 * of /auth/refresh and /auth/logout.
 */
const sessionClient = {
  client: z.enum(['web', 'app']).default('web'),
  /** Shown in the sessions list, e.g. "Chris's iPhone". Web sessions are named from the browser. */
  deviceName: z.string().trim().min(1).max(100).optional(),
};

export const registerSchema = z.object({
  email: emailAddress('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100),
  preferences: signUpPreferencesSchema.optional(),
  ...sessionClient,
});

export const loginSchema = z.object({
  email: emailAddress('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  ...sessionClient,
});

/** /auth/refresh and /auth/logout: apps send their refresh token here; the web app sends none (it's in the cookie). */
// Fastify hands over an empty body as null.
export const refreshSchema = z.object({ refreshToken: z.string().min(1).optional() }).nullish();

/** Deleting your account needs your password again. */
export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password to confirm'),
});

export const forgotPasswordSchema = z.object({
  email: emailAddress('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
