# Taskflow Deployment Guide

## Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| OS | Linux (Ubuntu 22.04+) | Ubuntu 24.04 LTS |
| RAM | 2 GB | 4 GB |
| Disk | 20 GB | 50 GB |
| Docker | 24.0+ | Latest |
| Docker Compose | v2.20+ | Latest |

A domain name with DNS A record pointing to your server's public IP is required for HTTPS.

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/taskflow.git
cd taskflow

# 2. Run the installer (interactive)
bash scripts/install.sh

# 3. Access the app
open https://your-domain.example.com
```

The installer will:
- Generate cryptographically secure secrets
- Create the Traefik Docker network
- Build application images
- Start all services
- Run database migrations

## Manual Setup

If you prefer to set up manually:

```bash
# Copy and edit environment file
cp .env.example .env
# Edit .env with your values (especially DOMAIN, secrets, passwords)

# Create Docker network for Traefik
docker network create traefik

# Build images
docker compose build

# Start infrastructure
docker compose up -d postgres redis minio traefik

# Run migrations
make migrate

# Start everything
docker compose up -d
```

## HTTPS / SSL

HTTPS is handled automatically by Traefik using Let's Encrypt. Certificates are obtained via HTTP challenge on port 80 and stored in the `letsencrypt` Docker volume.

**Requirements:**
- Port 80 and 443 open on your server/firewall
- Domain DNS pointing to your server before you start (Let's Encrypt needs to reach your server)
- Valid `ACME_EMAIL` in `.env` (used for expiry notifications)

Certificates auto-renew before expiry. To check certificate status:

```bash
docker compose logs traefik | grep -i cert
```

## Scaling the API

The API's HTTP endpoints are stateless, **but do not scale `api` beyond one
replica yet**: realtime uses Socket.io without a Redis adapter, so websocket
events emitted by one replica are invisible to clients connected to another,
and the load balancer has no sticky sessions for the socket handshake. Scale
vertically (raise the `deploy.resources` limits), or add the Socket.io Redis
adapter + sticky sessions first.

## Environment Variables

See [configuration.md](./configuration.md) for the full reference.

## Backup Procedures

### Manual backup

```bash
make backup
# or
bash scripts/backup.sh
```

Backups are saved to `./backups/` as timestamped `.tar.gz` archives containing:
- PostgreSQL dump (compressed SQL)
- MinIO file storage mirror
- Redis snapshot (queued jobs / reminder state)
- `.env` (encrypted when `BACKUP_PASSPHRASE` is set in `.env`; **plaintext otherwise — store backups securely**)
- `manifest.json` recording the app version, latest applied migration, and archive contents

### Scheduled backups

Add a cron job on the host:

```bash
# Daily backup at 2am
0 2 * * * cd /path/to/taskflow && bash scripts/backup.sh >> /var/log/taskflow-backup.log 2>&1
```

### Offsite backups

Set `BACKUP_S3_BUCKET` in `.env` to automatically upload backups to an S3 bucket after creation:

```env
BACKUP_S3_BUCKET=my-backup-bucket
```

Requires `aws` CLI installed and configured on the host.

### Restore from backup

```bash
# Interactive (lists available backups)
make restore

# Specify a backup file
make restore file=./backups/taskflow_20240101_020000.tar.gz
```

## Monitoring

### Health check

```bash
curl https://your-domain.example.com/health
```

Returns JSON with database and Redis status:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

A `503` status with `"status": "degraded"` indicates a backend dependency failure.

### Logs

```bash
# All services
make logs

# Single service
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f traefik
```

### Service status

```bash
make status
# or
docker compose ps
```

## Upgrade

```bash
bash scripts/upgrade.sh
```

The upgrade script:
1. Creates a pre-upgrade backup
2. Pulls/builds new images
3. Runs any pending migrations
4. Performs a rolling restart (worker → api → web) to minimise downtime

## Troubleshooting

### API won't start

Check environment variables:
```bash
docker compose logs api | head -50
```

Common causes: missing or invalid `JWT_SECRET` / `JWT_REFRESH_SECRET` (must be at least 32 chars), wrong `DATABASE_URL`.

### Cannot connect to database

```bash
docker compose exec postgres pg_isready -U taskflow
docker compose logs postgres
```

### HTTPS certificate not issued

```bash
docker compose logs traefik | grep -i acme
```

- Ensure port 80 is open (needed for HTTP challenge)
- Ensure DNS A record resolves to your server IP
- Check `ACME_EMAIL` is set correctly

### Out of disk space

```bash
# Remove unused Docker images
docker image prune -f

# Remove old backups manually
ls -lh backups/
```
