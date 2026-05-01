# Backup & Restore

## What to Back Up

| Data | Location | Method |
|------|----------|--------|
| PostgreSQL database | Docker volume `taskflow_postgres` | `pg_dump` |
| Uploaded files | S3 / MinIO bucket | S3 sync or MinIO mirror |
| Environment config | `.env` file | Copy to secure storage |

## Automated Backups with Make

```bash
make backup         # Dumps database + syncs files
make restore        # Restores from the most recent backup
```

Backups are written to `./backups/` by default.

## Manual Database Backup

```bash
docker-compose exec postgres pg_dump \
  -U taskflow \
  taskflow \
  | gzip > backups/taskflow-$(date +%Y%m%d-%H%M%S).sql.gz
```

## Manual Database Restore

```bash
# Stop the API first to avoid writes during restore
docker-compose stop api

gunzip -c backups/taskflow-20250101-120000.sql.gz \
  | docker-compose exec -T postgres psql -U taskflow taskflow

docker-compose start api
```

## Backing Up Files (MinIO)

If using the bundled MinIO container:

```bash
docker-compose exec minio mc mirror \
  /data/taskflow \
  /backup/taskflow-$(date +%Y%m%d)
```

If using AWS S3, use `aws s3 sync`:

```bash
aws s3 sync s3://your-taskflow-bucket ./backups/files/
```

## Scheduling Automatic Backups

Add a cron job on the host:

```cron
# Daily at 2 AM — database backup
0 2 * * * cd /opt/taskflow && make backup >> /var/log/taskflow-backup.log 2>&1
```

## Offsite Storage

Use `rclone` to sync backups to an offsite destination (S3, Backblaze B2, Google Drive):

```bash
rclone sync ./backups remote:taskflow-backups
```

## Verifying Backups

Periodically test that restores work:

```bash
# Restore to a test database
docker-compose exec postgres psql -U taskflow -c "CREATE DATABASE taskflow_test;"
gunzip -c backups/latest.sql.gz \
  | docker-compose exec -T postgres psql -U taskflow taskflow_test
docker-compose exec postgres psql -U taskflow -c "DROP DATABASE taskflow_test;"
```
