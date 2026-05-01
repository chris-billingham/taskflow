# Troubleshooting

## Container Status

```bash
docker-compose ps
docker-compose logs -f api
docker-compose logs -f postgres
docker-compose logs -f redis
```

---

## Common Issues

### API returns 503 on `/health`

The health check reports which service is down:

```json
{ "status": "degraded", "checks": { "database": "error", "redis": "ok" } }
```

**Database error**: Check if PostgreSQL is running and the `DATABASE_URL` is correct.

```bash
docker-compose exec postgres psql -U taskflow -c "SELECT 1;"
```

**Redis error**: Check if Redis is running.

```bash
docker-compose exec redis redis-cli ping
# Expected: PONG
```

---

### "Cannot connect to database"

1. Confirm `DATABASE_URL` in `.env` matches the Postgres container credentials
2. Ensure the `postgres` container is healthy: `docker-compose ps`
3. Run migrations if this is a fresh install: `docker-compose exec api npx prisma migrate deploy`

---

### "JWT secret not set" on startup

The `JWT_SECRET` variable is missing or empty in `.env`. Generate a secure one:

```bash
openssl rand -base64 32
```

---

### File uploads fail

1. Check that the S3/MinIO variables are set in `.env`:
   - `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
2. Verify the MinIO container is running: `docker-compose ps minio`
3. Check the API log for "Storage unavailable" warnings

---

### Emails not sending

1. Verify SMTP credentials in `.env`
2. Check the API log for Nodemailer errors
3. Test SMTP connectivity:

```bash
docker-compose exec api node -e "
const nm = require('nodemailer');
nm.createTransport({ host: process.env.SMTP_HOST, port: 587, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }})
  .verify(console.log);
"
```

---

### WebSocket connections fail

1. Ensure the `CORS_ORIGIN` in `.env` matches the frontend URL exactly (no trailing slash)
2. Check that your reverse proxy forwards the `Upgrade` and `Connection` headers
3. For Nginx, ensure your config includes:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

---

### "Port already in use"

Change the conflicting port in `.env`:

- API: `API_PORT=3002`
- Web (dev only): edit `vite.config.ts`

---

### High memory usage

- Redis: set `maxmemory` and an eviction policy in `docker-compose.yml`
- Postgres: tune `shared_buffers` and `work_mem` in `docker-compose.yml` environment

---

## Getting Help

- Check [GitHub Issues](https://github.com/your-org/taskflow/issues)
- Review logs carefully — most errors include a descriptive message
