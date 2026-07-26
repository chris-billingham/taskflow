# Troubleshooting

## Container Status

```bash
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs -f api
docker compose -f docker-compose.yml logs -f postgres
docker compose -f docker-compose.yml logs -f redis
```

---

## Common Issues

### API returns 503 on `/health`

Publicly the endpoint reports only `"status":"degraded"`. Ask from inside the
container to find out which dependency is at fault:

```bash
docker compose -f docker-compose.yml exec api wget -qO- http://localhost:3001/health
```

```json
{ "status": "degraded", "checks": { "database": "error", "redis": "ok" } }
```

**Database error**: Check if PostgreSQL is running and the `DATABASE_URL` is correct.

```bash
docker compose -f docker-compose.yml exec postgres psql -U taskflow -c "SELECT 1;"
```

**Redis error**: Check if Redis is running. It runs with `requirepass`, so
`redis-cli` needs the password:

```bash
docker compose -f docker-compose.yml exec redis redis-cli -a "$REDIS_PASSWORD" ping
# Expected: PONG
```

---

### "Cannot connect to database"

1. Confirm `DATABASE_URL` in `.env` matches the Postgres container credentials
2. Ensure the `postgres` container is healthy: `docker compose -f docker-compose.yml ps`
3. Run migrations if this is a fresh install: `docker compose -f docker-compose.yml exec api npx prisma migrate deploy`

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
2. Verify the MinIO container is running: `docker compose -f docker-compose.yml ps minio`
3. Check the API log for "Storage unavailable" warnings

---

### Emails not sending

1. Verify SMTP credentials in `.env`
2. Check the API log for Nodemailer errors
3. Test SMTP connectivity:

```bash
docker compose -f docker-compose.yml exec api node -e "
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
