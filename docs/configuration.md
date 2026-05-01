# Taskflow Configuration Reference

All configuration is provided via environment variables in `.env`.

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

## Object Storage (MinIO / S3)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MINIO_ROOT_USER` | Yes | `taskflow-admin` | MinIO admin username |
| `MINIO_ROOT_PASSWORD` | Yes | — | MinIO admin password |
| `MINIO_BUCKET` | No | `taskflow` | Bucket name for uploads |
| `S3_ENDPOINT` | No | `http://minio:9000` | S3-compatible endpoint |
| `S3_BUCKET` | No | `taskflow` | Bucket name used by API |
| `S3_REGION` | No | `us-east-1` | S3 region (cosmetic for MinIO) |
| `S3_ACCESS_KEY` | No | `taskflow-admin` | S3 access key |
| `S3_SECRET_KEY` | No | — | S3 secret key |
| `MAX_FILE_SIZE_MB` | No | `25` | Upload size limit in MB |

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
| `NODE_ENV` | No | `production` | Runtime environment |
| `API_PORT` | No | `3001` | Port the API listens on |
| `LOG_LEVEL` | No | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`) |
| `CORS_ORIGIN` | No | `https://<DOMAIN>` | Allowed CORS origin |

## Email (SMTP)

Email notifications are not yet fully wired — the infrastructure is present (nodemailer is installed) but SMTP configuration has not been added to the environment schema. To enable email:

1. Add SMTP variables to `packages/api/src/config/env.ts`
2. Configure a transporter in the notification service

Planned environment variables:

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | Port (usually `587` for TLS, `465` for SSL) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | Sender address |

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

## Docker Images

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCKER_REGISTRY` | `taskflow` | Registry prefix for images |
| `IMAGE_TAG` | `latest` | Image tag to deploy |

When `DOCKER_REGISTRY` is set to a real registry (e.g. `ghcr.io/your-org`), `upgrade.sh` will pull images rather than building locally.

## Performance Tuning

### API replicas

Edit `docker-compose.yml` → `api.deploy.replicas` or use:
```bash
docker compose up -d --scale api=3
```

Traefik load-balances automatically. Session tokens are stored in Redis so any replica can serve any request.

### Database connection pooling

The API uses Prisma's built-in connection pool. Tune pool size via `DATABASE_URL` query params:
```env
DATABASE_URL=postgresql://user:pass@postgres:5432/taskflow?connection_limit=20&pool_timeout=10
```

### Redis memory

Configured in `docker-compose.yml`:
```yaml
command: redis-server --requirepass ${REDIS_PASSWORD} --maxmemory 512mb --maxmemory-policy allkeys-lru
```

Increase `maxmemory` based on available RAM and usage pattern.

### File upload limits

```env
MAX_FILE_SIZE_MB=50
```

Also update the nginx `client_max_body_size` if using nginx as a proxy, and Traefik's `maxRequestBodyBytes` middleware if needed.
