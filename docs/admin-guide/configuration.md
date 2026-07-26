# Configuration Reference

For the full environment variable reference, see [../configuration.md](../configuration.md).

## Minimum Required Variables

```env
DATABASE_URL=postgresql://taskflow:PASSWORD@postgres:5432/taskflow
REDIS_URL=redis://redis:6379
JWT_SECRET=<at least 32 random bytes>
JWT_REFRESH_SECRET=<at least 32 random bytes>
```

Generate secrets:

```bash
openssl rand -base64 32
```

## Common Configuration Groups

### App URLs (required for production)

```env
APP_URL=https://your-domain.example.com
CORS_ORIGIN=https://your-domain.example.com
```

### Instance administrators

```env
ADMIN_EMAILS=you@example.com,ops@example.com
```

Comma-separated addresses that hold the instance-level `ADMIN` role. Promote-only
and idempotent — see [User Management](user-management.md) for the full workflow
and the recovery procedure.

### Email (optional)

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password
SMTP_FROM=noreply@your-domain.example.com
```

If SMTP is not configured, email features are disabled: new accounts are
auto-verified (so registration keeps working), but there is **no self-service
password reset** — recovery is an admin resetting it from the console. Set
`ADMIN_EMAILS` above before your first sign-up either way.

### File Storage

Default uses the bundled MinIO container. `docker-compose.yml` points the API's
S3 credentials at `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`, so in the bundled
setup those two are all you set:

```env
MINIO_ROOT_USER=taskflow-admin
MINIO_ROOT_PASSWORD=<strong password>
MINIO_BUCKET=taskflow
```

Connecting from outside Docker (local development, an external bucket) the API
reads them directly. **In production these have no default and the API refuses
to start without them** — the old `minioadmin` fallback shipped well-known
credentials to anyone who forgot to set them:

```env
S3_ENDPOINT=http://minio:9000
S3_BUCKET=taskflow
S3_ACCESS_KEY=taskflow-admin
S3_SECRET_KEY=<strong password>
S3_REGION=us-east-1
```

For AWS S3, omit `S3_ENDPOINT` and provide your bucket details:

```env
S3_BUCKET=my-taskflow-bucket
S3_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
S3_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
S3_REGION=us-east-1
```

### Performance Tuning

```env
API_PORT=3001
LOG_LEVEL=info            # debug | info | warn | error
MAX_FILE_SIZE_MB=50       # Maximum upload size
```

See the full reference at [../configuration.md](../configuration.md) for all variables and their defaults.
