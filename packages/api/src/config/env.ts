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
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(25),
  // SMTP — optional; when absent (or unreachable at boot) email features are
  // disabled and new accounts are auto-verified so nobody gets locked out.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('noreply@taskflow.local'),
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
  VAPID_SUBJECT: z.string().default('mailto:admin@taskflow.local'),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
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
