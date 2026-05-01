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

### Email (optional)

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password
SMTP_FROM=noreply@your-domain.example.com
```

If SMTP is not configured, email features (password reset, invitation emails) will be disabled.

### File Storage

Default uses the bundled MinIO container:

```env
S3_ENDPOINT=http://minio:9000
S3_BUCKET=taskflow
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
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
