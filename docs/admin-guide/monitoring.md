# Monitoring

## Health Check

The API exposes a health endpoint that checks all critical dependencies. It
returns `200` when healthy and `503` when degraded.

Publicly it reports only the verdict — an unauthenticated caller has no business
knowing your version or which dependency is down:

```bash
curl https://your-domain.example.com/health
```

```json
{ "status": "ok", "timestamp": "2025-05-01T12:00:00.000Z" }
```

Asked from the loopback interface — inside the container — it also reports the
version and the per-dependency breakdown. This is the form to reach for when
diagnosing a `503`:

```bash
docker compose -f docker-compose.yml exec api wget -qO- http://localhost:3001/health
```

```json
{
  "status": "degraded",
  "timestamp": "2025-05-01T12:00:00.000Z",
  "version": "1.0.0",
  "checks": { "database": "error", "redis": "ok" }
}
```

## Log Access

```bash
# All services
docker compose -f docker-compose.yml logs -f

# API only
docker compose -f docker-compose.yml logs -f api

# Last 100 lines
docker compose -f docker-compose.yml logs --tail=100 api
```

API logs are structured JSON in production. In development they use pino-pretty formatting.

## Disk Usage

```bash
# Docker volumes
docker system df -v

# Container disk usage
docker compose -f docker-compose.yml exec api df -h
docker compose -f docker-compose.yml exec postgres df -h
```

## Database Monitoring

```bash
# Active connections
docker compose -f docker-compose.yml exec postgres psql -U taskflow -c "SELECT count(*) FROM pg_stat_activity;"

# Table sizes
docker compose -f docker-compose.yml exec postgres psql -U taskflow -c "
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;
"
```

## Redis Monitoring

Redis runs with `requirepass`, so `redis-cli` needs the password (`make
shell-redis` passes it for you):

```bash
docker compose -f docker-compose.yml exec redis redis-cli -a "$REDIS_PASSWORD" info stats
docker compose -f docker-compose.yml exec redis redis-cli -a "$REDIS_PASSWORD" info memory

# Queue depth — reminders, digests and the nightly cleanup all live here
docker compose -f docker-compose.yml exec redis redis-cli -a "$REDIS_PASSWORD" keys 'bull:*:wait'
```

Watch `used_memory` against the 256 MB `maxmemory`. The policy is `noeviction`
by design (these are queues, not a cache), so exhausting it makes writes fail
rather than silently dropping jobs — but it does mean memory pressure surfaces
as errors in the API and worker logs.

## Uptime Monitoring

An external monitor is not optional. Docker's own healthchecks only **report**
status — `restart: unless-stopped` reacts to a process exiting, not to a
container going unhealthy, so a container that is up but failing its probe stays
that way until someone intervenes. Nothing in the stack watches the stack.

Point an external monitor (e.g. UptimeRobot, Better Uptime) at:

```
https://your-domain.example.com/health
```

Set an alert threshold of 30 seconds and an HTTP keyword check for `"status":"ok"`.

The `worker` service exposes no HTTP endpoint, so it can't be probed from
outside. Check it locally instead — if this reports anything but `healthy`,
reminders, digests and the nightly cleanup are not running:

```bash
docker compose -f docker-compose.yml ps worker
```

If you want unhealthy containers restarted automatically, add a supervisor such
as [willfarrell/autoheal](https://github.com/willfarrell/docker-autoheal) to the
compose file; the shipped stack deliberately doesn't assume one.

## Log Aggregation

For production deployments, ship logs to an aggregation service:

```yaml
# docker-compose.yml — add logging config to each service
logging:
  driver: "json-file"
  options:
    max-size: "100m"
    max-file: "5"
```

Or use a syslog driver to forward to Loki, Papertrail, or Datadog.
