import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  API_PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  // S3 / MinIO storage
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_BUCKET: z.string().default('taskflow'),
  S3_REGION: z.string().default('us-east-1'),
  // No default: these previously fell back to minioadmin/minioadmin, so a
  // deployment that forgot to set them came up with well-known credentials
  // and no warning. Required in production; dev/test keep the MinIO default
  // (see the refinement below) so local setup stays one command.
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  MAX_FILE_SIZE_MB: z.coerce.number().default(25),
  // SMTP — optional; when absent (or unreachable at boot) email features are
  // disabled and new accounts are auto-verified so nobody gets locked out.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // .local is not a routable TLD — most receiving MTAs reject or silently
  // drop mail from it, so this default is only viable when SMTP is unset (in
  // which case nothing is sent). Configuring SMTP without SMTP_FROM is
  // rejected at boot rather than producing mail nobody receives.
  SMTP_FROM: z.string().optional(),
  // Public base URL of the web app, used for links in emails. Falls back to
  // CORS_ORIGIN (which is the web origin in every shipped topology).
  APP_URL: z.string().url().optional(),
  // Comma-separated addresses designated instance administrators. Promote-only
  // and idempotent: listed accounts are promoted at boot (and any matching
  // sign-up is created as an admin), but nothing here ever demotes, deletes or
  // reactivates an account. This is the bootstrap and break-glass path.
  ADMIN_EMAILS: z
    .string()
    .optional()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0),
    ),
  // Serve Swagger UI at /api/docs in production (always on in development)
  ENABLE_API_DOCS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  // Web Push (optional). Generate a pair with:
  //   docker compose -f docker-compose.yml run --rm api npx web-push generate-vapid-keys
  // Push notifications are disabled until both keys are set.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  // Push services reject an unroutable contact address, so this is required
  // alongside the keys rather than defaulted to a .local placeholder.
  VAPID_SUBJECT: z.string().optional(),
});

/**
 * Cross-field rules that a per-field default would otherwise paper over.
 * Each of these used to have a plausible-looking fallback that produced a
 * silently broken deployment (well-known storage credentials, mail from an
 * unroutable domain) rather than a startup error.
 */
function checkRequiredCombinations(
  env: z.infer<typeof envSchema>,
): string[] {
  const errors: string[] = [];

  if (env.NODE_ENV === 'production') {
    if (!env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
      errors.push(
        'S3_ACCESS_KEY and S3_SECRET_KEY are required in production (there is no default — the old minioadmin fallback shipped well-known credentials)',
      );
    }
  }

  if (env.SMTP_HOST && !env.SMTP_FROM) {
    errors.push('SMTP_FROM is required when SMTP_HOST is set');
  }

  if ((env.VAPID_PUBLIC_KEY || env.VAPID_PRIVATE_KEY) && !env.VAPID_SUBJECT) {
    errors.push(
      'VAPID_SUBJECT is required when VAPID keys are set (e.g. mailto:admin@your-domain.example)',
    );
  }

  return errors;
}

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  const combinationErrors = checkRequiredCombinations(result.data);
  if (combinationErrors.length > 0) {
    console.error('Invalid environment configuration:');
    for (const message of combinationErrors) {
      console.error(`  ${message}`);
    }
    process.exit(1);
  }

  // Outside production, fall back to the docker-compose MinIO credentials so
  // `pnpm dev` and the test suites need no extra configuration.
  if (result.data.NODE_ENV !== 'production') {
    result.data.S3_ACCESS_KEY ??= 'minioadmin';
    result.data.S3_SECRET_KEY ??= 'minioadmin';
  }

  return result.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof envSchema>;

/**
 * Whether an address is designated an instance administrator by configuration.
 * Lives here rather than in a service so both registration and the admin
 * bootstrap read the same normalised list.
 */
export function isBootstrapAdminEmail(email: string): boolean {
  return env.ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
