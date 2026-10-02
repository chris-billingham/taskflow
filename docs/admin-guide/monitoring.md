# Monitoring

## The System panel

**Settings → Admin → System** shows the running release, whether the
database, Redis and the background worker are working, how many jobs are
waiting in each queue, and jobs that ran out of retries (with the error), which
you can run again or discard. It refreshes every 30 seconds.

## Health Check

The API answers three health checks, all public:

| Path | Answers `200` when | Use it for |
|------|-------------------|------------|
| `/health/live` | the API process responds | liveness: restart the container if this fails |
| `/health/ready` | the database and Redis both answer too (else `503`) | readiness and uptime monitors |
| `/health` | same as `/health/ready` | the name existing monitors use |

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
docker compose -f docker-compose.yml exec api wget -qO- http://127.0.0.1:3001/health
```

```json
{
  "status": "degraded",
  "timestamp": "2025-05-01T12:00:00.000Z",
  "version": "1.2.0",
  "checks": { "database": "error", "redis": "ok" }
}
```

The background worker isn't part of these checks: the API container's own
healthcheck uses `/health`, and Traefik stops routing to an unhealthy
container, so a stopped worker would take the whole app offline. Watch the
worker through the System panel, `docker compose ps worker`, or `/metrics`.

## Background Worker

The worker records a heartbeat every 15 seconds, in Redis (read by the System
panel and `/metrics`) and in a file its container healthcheck reads. If it
misses a minute of heartbeats, because it lost Redis, its event loop stuck, or
it exited, the container turns `unhealthy` and the System panel says
reminders and email aren't being sent:

```bash
docker compose -f docker-compose.yml ps worker
```

## Metrics

`GET /metrics` on the API serves Prometheus metrics:

| Metric | What it is |
|--------|------------|
| `taskflow_info{version,commit}` | The running release |
| `taskflow_up{dependency}` | `1` if the database, Redis or worker is working |
| `taskflow_worker_heartbeat_age_seconds` | Seconds since the worker last reported in |
| `taskflow_queue_jobs{queue,state}` | Jobs waiting, running, scheduled or failed in each queue |
| `taskflow_users{state}` | Active, suspended and unverified accounts |
| `process_resident_memory_bytes`, `nodejs_heap_used_bytes`, `process_uptime_seconds`, `nodejs_eventloop_delay_seconds` | The API process |

It isn't routed through Traefik, so only containers on the same Docker
networks can reach it, at `http://api:3001/metrics`. Set `METRICS_TOKEN` to
require `Authorization: Bearer <token>` as well. Useful alerts:
`taskflow_up == 0` for five minutes, and a rising
`taskflow_queue_jobs{state="failed"}`.

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

```

Queue depth and failed jobs are on the System panel and in `/metrics`.

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

The `worker` service exposes no HTTP endpoint, so an external monitor can't
see it. Alert on `taskflow_up{dependency="worker"}` if you scrape `/metrics`,
or check the System panel.

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
