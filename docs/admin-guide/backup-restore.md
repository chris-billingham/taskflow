# Backup & Restore

## What a Backup Contains

`make backup` (or `bash scripts/backup.sh`) writes a timestamped `.tar.gz`
archive to `./backups/` containing everything a restore needs:

| Data | Notes |
|------|-------|
| PostgreSQL dump | compressed SQL, taken with `pg_dump` |
| Uploaded files | full MinIO bucket mirror |
| Redis snapshot | queued jobs and reminder delivery state |
| `.env` | encrypted when `BACKUP_PASSPHRASE` is set in `.env`; **plaintext otherwise — store archives securely** |
| `manifest.json` | app version, latest applied migration, archive contents |

A failed file mirror **aborts the backup** rather than reporting success with
attachments missing. The last 7 archives are retained.

## Creating Backups

```bash
make backup
# or
bash scripts/backup.sh
```

### Scheduling

```cron
# Daily at 2 AM
0 2 * * * cd /opt/taskflow && bash scripts/backup.sh >> /var/log/taskflow-backup.log 2>&1
```

### Offsite

Set `BACKUP_S3_BUCKET` in `.env` to upload each archive to S3 after creation
(requires the `aws` CLI on the host), or sync `./backups` with `rclone`:

```bash
rclone sync ./backups remote:taskflow-backups
```

## Restoring

```bash
# Interactive: lists available archives and prompts for one
make restore

# Or specify the archive
bash scripts/restore.sh ./backups/taskflow_20260101_020000.tar.gz
```

The restore script:

1. **Verifies the archive first** — a corrupt archive or missing dump aborts
   before anything is touched.
2. Stops the `api` and `worker` containers.
3. Drops and recreates the database, then loads the dump
   (`ON_ERROR_STOP` — a mid-restore SQL error aborts loudly).
4. Runs `prisma migrate deploy` so an older dump is reconciled with the
   currently deployed code's schema.
5. Restores the MinIO bucket **point-in-time**: objects uploaded after the
   backup was taken are removed.
6. Flushes Redis (stale sessions and queue jobs reference the pre-restore
   world; users simply sign in again).
7. Restarts the application containers.

## Verifying Backups

Run a periodic drill on a disposable stack: restore the latest archive with
`TASKFLOW_COMPOSE_FILE` pointing at a test compose file, then check row counts
and attachment downloads. The archive's `manifest.json` records what should be
present.
