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

Attachments are stored in the bundled [Garage](https://garagehq.deuxfleurs.fr/)
container, an S3-compatible server built for small self-hosted setups. (Earlier
versions bundled MinIO; its images were withdrawn upstream in 2026.) On first
start, Garage creates the access key and bucket named below, and
`docker-compose.yml` hands the same values to the API. `scripts/install.sh`
generates all three secrets:

```env
S3_ACCESS_KEY=GK<24 hex characters>   # GK$(openssl rand -hex 12)
S3_SECRET_KEY=<64 hex characters>     # openssl rand -hex 32
S3_BUCKET=taskflow
GARAGE_RPC_SECRET=<64 hex characters> # openssl rand -hex 32
```

Garage rejects keys in any other format, so keep to these shapes if you write
them by hand. **In production the API refuses to start without
`S3_ACCESS_KEY` and `S3_SECRET_KEY`**; there are no default credentials.

To use AWS S3 or another provider instead, set the endpoint and region too,
then delete the `garage` service and the two `garage:` entries under
`depends_on` in `docker-compose.yml`:

```env
S3_ENDPOINT=https://s3.eu-west-2.amazonaws.com
S3_REGION=eu-west-2
S3_BUCKET=my-taskflow-bucket
S3_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
S3_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

### Performance Tuning

```env
API_PORT=3001
LOG_LEVEL=info            # debug | info | warn | error
MAX_FILE_SIZE_MB=50       # Maximum upload size
```

See the full reference at [../configuration.md](../configuration.md) for all variables and their defaults.
