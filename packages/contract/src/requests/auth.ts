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

const secondFactor = {
  /** Six digits from the authenticator app. */
  code: z.string().trim().max(10).optional(),
  /** One of the recovery codes, used up once accepted. */
  recoveryCode: z.string().trim().max(32).optional(),
};
const oneFactor = (v: { code?: string; recoveryCode?: string }) => !!v.code !== !!v.recoveryCode;
const oneFactorMessage = { message: 'Enter a code from your authenticator app, or a recovery code' };

/** Step two of signing in to an account with two-factor sign-in. */
export const twoFactorLoginSchema = z
  .object({ challengeToken: z.string().min(1), ...secondFactor, ...sessionClient })
  .refine(oneFactor, oneFactorMessage);

/** Turning two-factor on needs a code from the newly added app. */
export const enableTwoFactorSchema = z.object({ code: z.string().trim().min(6).max(10) });

/** Turning it off needs the password and a current second factor. */
export const disableTwoFactorSchema = z
  .object({ password: z.string().min(1, 'Password is required'), ...secondFactor })
  .refine(oneFactor, oneFactorMessage);

/** /auth/refresh and /auth/logout: apps send their refresh token here; the web app sends none (it's in the cookie). */
// Fastify hands over an empty body as null.
export const refreshSchema = z.object({ refreshToken: z.string().min(1).optional() }).nullish();

/** Deleting your account needs your password again. */
export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password to confirm'),
});

/** Security changes (setting up two-factor, new recovery codes) ask for the password again. */
export const passwordConfirmationSchema = deleteAccountSchema;

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
  /** Not needed by a single sign-on account choosing its first password. */
  currentPassword: z.string().min(1, 'Current password is required').optional(),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type TwoFactorLoginInput = z.infer<typeof twoFactorLoginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
