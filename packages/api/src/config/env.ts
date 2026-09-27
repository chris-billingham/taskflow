import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.url(),
  REDIS_URL: z.url().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  API_PORT: z.coerce.number().default(3001),
  // Proxy hops between the client and the API. Used as Fastify's `trustProxy`
  // so request.ip — and therefore every rate-limit bucket — comes from the
  // outermost hop we actually trust rather than from a spoofable header. 1 is
  // the shipped production topology (client → Traefik → API); add one for each
  // additional proxy you put in front, e.g. a CDN. The value is immaterial in
  // development: nothing there sets X-Forwarded-For (Vite's proxy doesn't), so
  // request.ip falls back to the socket address.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
  // Networks a proxy hop must come from to be believed (proxy-addr names, IPs
  // or CIDRs). The default covers Docker bridge networks and loopback (Vite's
  // dev proxy); narrow it to the Traefik network's CIDR if you know it.
  TRUST_PROXY_ADDRS: z.string().min(1).default('loopback,linklocal,uniquelocal'),
  // Scales every production rate limit (login 5/15min, register 5/h, global
  // 300/min, ...). Limits count per client IP, so a team signing in from one
  // office NAT shares a bucket; raise this for that, or for end-to-end runs
  // against a production build. Values below 1 are rejected: this can only
  // loosen the shipped limits, never switch them off.
  RATE_LIMIT_MULTIPLIER: z.coerce.number().min(1).max(1000).default(1),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  // S3-compatible storage (bundled: Garage)
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_BUCKET: z.string().default('taskflow'),
  S3_REGION: z.string().default('us-east-1'),
  // No default: these previously fell back to minioadmin/minioadmin, so a
  // deployment that forgot to set them came up with well-known credentials
  // and no warning. Required in production; dev/test fall back to the
  // docker-compose.dev.yml Garage key (see below) so local setup stays one command.
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
  APP_URL: z.url().optional(),
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
  // Who may create an account until an admin changes it in the console:
  // 'invite' (default) allows the first account, ADMIN_EMAILS addresses and
  // people with a pending workspace invite; 'open' allows anyone who can reach
  // the site.
  REGISTRATION_MODE: z.enum(['invite', 'open']).default('invite'),
  // Run the BullMQ workers inside the API process.
  //
  // Production ships a dedicated `worker` container (docker-compose.yml) with
  // its own resource limits, so the API defaults to NOT also running them —
  // otherwise digests and sweeps compete with request serving for the API's
  // CPU and memory budget, and which process happens to pick up a job becomes
  // observable. Outside production it defaults ON, because `pnpm dev` starts
  // no separate worker. Set to 'true' if you deploy the API without a worker.
  RUN_WORKERS_IN_API: z.string().optional(),
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

  // Outside production, fall back to the docker-compose.dev.yml Garage key so
  // `pnpm dev` and the test suites need no extra configuration.
  if (result.data.NODE_ENV !== 'production') {
    result.data.S3_ACCESS_KEY ??= 'GK000000000000000000000001';
    result.data.S3_SECRET_KEY ??= 'a61e5c5683e8712af4b0934445b3e31d3c367aeda7e6ac6334474ffa1af7a6f7';
  }

  return result.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof envSchema>;

/** Whether this API process should also run the background job workers. */
export function shouldRunWorkersInApi(): boolean {
  if (env.RUN_WORKERS_IN_API !== undefined) {
    return env.RUN_WORKERS_IN_API === 'true';
  }
  return env.NODE_ENV !== 'production';
}

/**
 * Whether an address is designated an instance administrator by configuration.
 * Lives here rather than in a service so both registration and the admin
 * bootstrap read the same normalised list.
 */
export function isBootstrapAdminEmail(email: string): boolean {
  return env.ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
