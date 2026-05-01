# Monitoring

## Health Check

The API exposes a health endpoint that checks all critical dependencies:

```bash
curl https://your-domain.example.com/health
```

Response:

```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2025-05-01T12:00:00.000Z",
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

Returns `200` when healthy, `503` when degraded.

## Log Access

```bash
# All services
docker-compose logs -f

# API only
docker-compose logs -f api

# Last 100 lines
docker-compose logs --tail=100 api
```

API logs are structured JSON in production. In development they use pino-pretty formatting.

## Disk Usage

```bash
# Docker volumes
docker system df -v

# Container disk usage
docker-compose exec api df -h
docker-compose exec postgres df -h
```

## Database Monitoring

```bash
# Active connections
docker-compose exec postgres psql -U taskflow -c "SELECT count(*) FROM pg_stat_activity;"

# Table sizes
docker-compose exec postgres psql -U taskflow -c "
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;
"
```

## Redis Monitoring

```bash
docker-compose exec redis redis-cli info stats
docker-compose exec redis redis-cli info memory
```

## Uptime Monitoring

Use an external uptime monitor (e.g. UptimeRobot, Better Uptime) pointed at:

```
https://your-domain.example.com/health
```

Set an alert threshold of 30 seconds and an HTTP keyword check for `"status":"ok"`.

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
