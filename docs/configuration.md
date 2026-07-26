# Taskflow Configuration Reference

All configuration is provided via environment variables in `.env`.

`docker-compose.yml` passes a fixed list of these into the `api` and `worker`
containers. A variable that is not in those `environment:` blocks has no effect
on a production deployment no matter what `.env` says — if you add a new one,
wire it there too.

## Domain & SSL

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DOMAIN` | Yes | — | Public domain (e.g. `taskflow.example.com`) |
| `ACME_EMAIL` | Yes | — | Email for Let's Encrypt notifications |

## Database (PostgreSQL)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_USER` | Yes | `taskflow` | Database username |
| `POSTGRES_PASSWORD` | Yes | — | Database password |
| `POSTGRES_DB` | Yes | `taskflow` | Database name |
| `DATABASE_URL` | Auto | — | Full connection string (set automatically by docker-compose) |

`DATABASE_URL` is composed from the above three variables in `docker-compose.yml`. Only needed when connecting from outside Docker (e.g. local dev).

## Redis

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_PASSWORD` | Yes | — | Redis `requirepass` value |
| `REDIS_URL` | Auto | — | Full Redis URL (set automatically in docker-compose) |

## Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | — | Access token signing key (≥ 32 chars) |
| `JWT_REFRESH_SECRET` | Yes | — | Refresh token signing key (≥ 32 chars) |

Generate secure values with:
```bash
openssl rand -hex 32
```

Access tokens last 15 minutes, refresh tokens 30 days. Neither is currently
tunable by configuration.

## Instance administrators

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ADMIN_EMAILS` | Recommended | — | Comma-separated addresses holding the instance `ADMIN` role |

Admins manage **accounts** deployment-wide (create, suspend, reset passwords,
delete). They get no extra access to anyone's tasks or projects.

Promote-only and idempotent: a listed address that registers is created as an
admin immediately, one that already has an account is promoted at API startup,
and nothing here ever demotes, reactivates or deletes an account.

**Set this before your first sign-up.** With no admin and no working SMTP, a
forgotten password has no recovery path short of a database edit. See
[admin-guide/user-management.md](admin-guide/user-management.md).

## Object Storage (MinIO / S3)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MINIO_ROOT_USER` | Yes | `taskflow-admin` | MinIO admin username |
| `MINIO_ROOT_PASSWORD` | Yes | — | MinIO admin password |
| `MINIO_BUCKET` | No | `taskflow` | Bucket name for uploads |
| `S3_ENDPOINT` | No | `http://localhost:9000` | S3-compatible endpoint (compose sets `http://minio:9000`) |
| `S3_BUCKET` | No | `taskflow` | Bucket name used by API |
| `S3_REGION` | No | `us-east-1` | S3 region (cosmetic for MinIO) |
| `S3_ACCESS_KEY` | **In production** | none | S3 access key — no fallback; the API refuses to start without it |
| `S3_SECRET_KEY` | **In production** | none | S3 secret key — same |
| `MAX_FILE_SIZE_MB` | No | `25` | Upload size limit in MB |

`S3_ACCESS_KEY` / `S3_SECRET_KEY` deliberately have no defaults: they used to
fall back to `minioadmin`/`minioadmin`, so a deployment that forgot them came up
with well-known credentials and no warning. Outside production (dev and the test
suites) those MinIO defaults still apply so local setup needs no configuration.

In the bundled topology, compose points both at `MINIO_ROOT_USER` /
`MINIO_ROOT_PASSWORD`, so setting those two is enough.

Attachment downloads are **proxied through the API**, not served by presigned
URL — the S3 endpoint is internal-only and proxying lets the API enforce access
checks and download semantics on untrusted content.

`MAX_FILE_SIZE_MB` is served to the web app at runtime (`GET
/api/v1/attachments/limits`), so raising it needs no frontend rebuild. If you
raise it substantially, also raise the proxy body limit (Traefik's
`maxRequestBodyBytes`, or nginx's `client_max_body_size` in the nginx topology).

### Using an external S3 bucket

To use AWS S3 or another S3-compatible provider instead of MinIO, remove the `minio` service from `docker-compose.yml` and set:

```env
S3_ENDPOINT=https://s3.amazonaws.com
S3_BUCKET=my-taskflow-bucket
S3_REGION=us-east-1
S3_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
S3_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

## API

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Runtime environment (compose sets `production`) |
| `API_PORT` | No | `3001` | Port the API listens on |
| `HOST` | No | `0.0.0.0` | Bind address |
| `LOG_LEVEL` | No | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`) |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origin (compose sets `https://<DOMAIN>`) |
| `APP_URL` | No | falls back to `CORS_ORIGIN` | Public base URL used for links in email |
| `TRUST_PROXY_HOPS` | No | `1` | Number of proxy hops in front of the API |
| `RUN_WORKERS_IN_API` | No | off in production | Also run background jobs in the API process |
| `ENABLE_API_DOCS` | No | off | Serve Swagger UI at `/api/docs` (always on in development) |

### `TRUST_PROXY_HOPS`

Determines which address the API treats as the client, and therefore what every
rate limit is keyed on. `1` is correct for the shipped deployment (client →
Traefik → API) and for local dev (Vite's proxy).

Add one for each extra proxy you put in front — a CDN, or an outer reverse
proxy. Too low and all traffic keys on that proxy's IP, making the limits one
shared bucket; too high and clients can forge `X-Forwarded-For` and give
themselves a fresh bucket per request.

### `RUN_WORKERS_IN_API`

Production runs a separate `worker` container that owns the BullMQ queues, so
the API does not also start them. Set to `true` only if you deploy the API
without a worker container — otherwise reminders, digests, due-date notices and
the nightly cleanup will not run at all.

## Email (SMTP)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | No | — | SMTP server hostname; email features stay disabled while unset |
| `SMTP_PORT` | No | `587` | Port (`465` switches to implicit TLS) |
| `SMTP_USER` | No | — | SMTP username; omit for an unauthenticated relay |
| `SMTP_PASS` | No | — | SMTP password |
| `SMTP_FROM` | With `SMTP_HOST` | — | Sender address; startup fails if `SMTP_HOST` is set without it |

Email is optional. Both the API and the worker verify the SMTP transport at
boot and enable email only if it succeeds — so a configured-but-unreachable
host degrades to "no email" instead of breaking sign-ups. Set these on both
services (compose does): the API sends verification, reset and invite mail,
while the worker sends reminders, digests and due-date notices.

Without working SMTP:

- new accounts are auto-verified, so registration still works
- **there is no self-service password reset** — recovery is an admin resetting
  the password from the console, which is why `ADMIN_EMAILS` matters
- workspace invites produce a join link to pass on by hand, and digests are
  never delivered

### Common SMTP providers

**Gmail:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password  # Generate at myaccount.google.com/apppasswords
SMTP_FROM=you@gmail.com
```

**SendGrid:**
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.your-sendgrid-api-key
SMTP_FROM=noreply@yourdomain.com
```

**Mailgun:**
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@mg.yourdomain.com
SMTP_PASS=your-mailgun-smtp-password
SMTP_FROM=noreply@yourdomain.com
```

## Web Push

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VAPID_PUBLIC_KEY` | No | — | VAPID public key; push stays disabled until both keys are set |
| `VAPID_PRIVATE_KEY` | No | — | VAPID private key |
| `VAPID_SUBJECT` | With the keys | — | Contact address, e.g. `mailto:admin@your-domain.example` |

Generate a pair with:

```bash
docker compose -f docker-compose.yml run --rm api npx web-push generate-vapid-keys
```

The public key is served to the browser at runtime, so enabling push needs no
frontend rebuild. Push is the only delivery method reminders currently use.

## Docker Images

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCKER_REGISTRY` | `taskflow` | Registry prefix for images |
| `IMAGE_TAG` | `latest` | Image tag to deploy |

When `DOCKER_REGISTRY` is set to a real registry (e.g. `ghcr.io/your-org`), `upgrade.sh` will pull images rather than building locally.

## Backups

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKUP_DIR` | `./backups` | Where archives are written |
| `BACKUP_PASSPHRASE` | — | Encrypts the `.env` copy inside each archive; **plaintext without it** |
| `BACKUP_S3_BUCKET` | — | Upload each archive here after creation (needs the `aws` CLI) |

See [admin-guide/backup-restore.md](admin-guide/backup-restore.md).

## Performance Tuning

### API replicas

**Do not scale `api` beyond one replica.** Realtime uses Socket.io without the
Redis adapter, so websocket events emitted by one replica are invisible to
clients connected to another, and there are no sticky sessions for the socket
handshake. Scale vertically by raising the `deploy.resources` limits in
`docker-compose.yml`, or add the Socket.io Redis adapter plus sticky sessions
first. See [deployment.md](deployment.md#scaling-the-api).

The `worker` service is also single-instance by design: the repeatable job
schedules are shared through Redis, but nothing coordinates a second replica's
claim on presence or reminder state.

### Database connection pooling

The API uses Prisma's built-in connection pool. Tune pool size via `DATABASE_URL` query params:
```env
DATABASE_URL=postgresql://user:pass@postgres:5432/taskflow?connection_limit=20&pool_timeout=10
```

### Redis memory

Configured in `docker-compose.yml`:

```yaml
command: >
  redis-server
  --requirepass ${REDIS_PASSWORD}
  --maxmemory 256mb
  --maxmemory-policy noeviction
  --appendonly yes
```

Raise `maxmemory` based on available RAM. **Keep `noeviction`** — Redis holds
BullMQ's queues and the password-reset tokens, not a disposable cache, and an
eviction policy like `allkeys-lru` would silently drop queued reminders and
digests under memory pressure. `appendonly yes` is likewise deliberate: it
preserves queue state across a restart.

### Request limits

Rate limits are Redis-backed and keyed on the client address (see
`TRUST_PROXY_HOPS`): 300 requests/minute globally in production, with tighter
per-route budgets on authentication (5 logins per 15 minutes, 3 password-reset
requests per hour) and uploads (60 per 10 minutes). These are currently
compiled in rather than configurable.

JSON bodies are capped at 1 MB; file uploads at `MAX_FILE_SIZE_MB`.
