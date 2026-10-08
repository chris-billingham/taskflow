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
docker compose -f docker-compose.yml exec api wget -qO- http://127.0.0.1:3001/health
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

1. Confirm `POSTGRES_PASSWORD` in `.env` hasn't changed since the database was created (compose builds `DATABASE_URL` from it, and Postgres keeps the password it started with)
2. Ensure the `postgres` container is healthy: `docker compose -f docker-compose.yml ps`
3. Run migrations if this is a fresh install: `docker compose -f docker-compose.yml exec api npx prisma migrate deploy`

---

### "JWT secret not set" on startup

The `JWT_SECRET` variable is missing or empty in `.env`. Generate a secure one,
then run `docker compose -f docker-compose.yml up -d api worker`:

```bash
openssl rand -hex 32
```

---

### File uploads fail

1. Check that the storage variables are set in `.env`:
   - `S3_ACCESS_KEY` (`GK` + 24 hex), `S3_SECRET_KEY` (64 hex), `S3_BUCKET`, `GARAGE_RPC_SECRET`
2. Verify Garage is running and healthy: `docker compose -f docker-compose.yml ps garage`.
   If it keeps restarting, `docker compose -f docker-compose.yml logs garage` usually
   names the malformed key or secret.
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

1. Open the app at exactly `https://$DOMAIN`: the API only accepts browser connections from that address
2. Check that your reverse proxy forwards the `Upgrade` and `Connection` headers
3. For Nginx, ensure your config includes:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

---

### "Port already in use"

In production only Traefik publishes ports (80 and 443); stop whatever else is
using them. In development, the API port is `API_PORT` in `.env` and the web
port is set in `packages/web/vite.config.ts`.

---

### High memory usage

- Redis: capped at 256 MB with eviction off (`docker-compose.yml`). Keep
  eviction off: Redis holds the job queues and rate limits, and evicting them
  loses work. If it fills up, look for a backlog of failed jobs in the worker
  log.
- Postgres: tune `shared_buffers` and `work_mem` in `docker-compose.yml` environment

---

## Getting Help

- Check [GitHub Issues](https://github.com/chris-billingham/taskflow/issues)
- Review logs carefully — most errors include a descriptive message
