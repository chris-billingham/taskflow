#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Pin the production compose file (don't merge the dev override).
# TASKFLOW_COMPOSE_FILE exists so restore drills can target a test stack.
COMPOSE="docker compose -f ${TASKFLOW_COMPOSE_FILE:-docker-compose.yml}"

if [ ! -f .env ]; then
  error ".env not found. Run install.sh first."
  exit 1
fi

# shellcheck disable=SC1091
source .env

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_NAME="taskflow_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

mkdir -p "$BACKUP_PATH"

# ── Database backup ───────────────────────────────────────────────────────────
info "Backing up PostgreSQL database..."
$COMPOSE exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-taskflow}" \
  "${POSTGRES_DB:-taskflow}" \
  | gzip > "${BACKUP_PATH}/database.sql.gz"

DB_SIZE=$(du -sh "${BACKUP_PATH}/database.sql.gz" | cut -f1)
info "Database backup complete (${DB_SIZE})"

# ── File storage backup ───────────────────────────────────────────────────────
info "Backing up uploaded files from MinIO..."
MINIO_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-minioadmin}"
BUCKET="${MINIO_BUCKET:-taskflow}"

# Clear any previous mirror inside the container first — otherwise objects deleted
# since the last backup linger and get re-captured into every future backup.
$COMPOSE exec -T minio rm -rf /tmp/minio-backup 2>/dev/null || true

$COMPOSE exec -T minio sh -c \
  "mc alias set local http://localhost:9000 '${MINIO_USER}' '${MINIO_PASS}' --api s3v4 >/dev/null"

if $COMPOSE exec -T minio sh -c "mc ls local/${BUCKET} >/dev/null 2>&1"; then
  # A failed mirror MUST fail the backup: months of "successful" backups with
  # no attachments in them is how you find out during a disaster.
  if ! $COMPOSE exec -T minio sh -c \
    "mc mirror local/${BUCKET} /tmp/minio-backup/ --quiet"; then
    error "MinIO file backup FAILED — aborting so this is not reported as a good backup."
    exit 1
  fi
  if $COMPOSE exec -T minio test -d /tmp/minio-backup 2>/dev/null; then
    docker cp "$($COMPOSE ps -q minio):/tmp/minio-backup" "${BACKUP_PATH}/files"
    FILES_SIZE=$(du -sh "${BACKUP_PATH}/files" 2>/dev/null | cut -f1 || echo "0")
    info "File backup complete (${FILES_SIZE})"
  else
    info "Bucket is empty — no files to back up"
  fi
else
  info "Bucket '${BUCKET}' does not exist yet — no files to back up"
fi

# ── Redis snapshot (queues/reminders; best-effort) ────────────────────────────
info "Snapshotting Redis..."
REDIS_CLI="redis-cli"
[ -n "${REDIS_PASSWORD:-}" ] && REDIS_CLI="redis-cli -a ${REDIS_PASSWORD}"
if LAST_SAVE=$($COMPOSE exec -T redis sh -c "$REDIS_CLI LASTSAVE" 2>/dev/null | tr -d '[:space:]'); then
  $COMPOSE exec -T redis sh -c "$REDIS_CLI BGSAVE" >/dev/null
  for _ in $(seq 1 30); do
    NOW_SAVE=$($COMPOSE exec -T redis sh -c "$REDIS_CLI LASTSAVE" 2>/dev/null | tr -d '[:space:]')
    [ "$NOW_SAVE" != "$LAST_SAVE" ] && break
    sleep 1
  done
  if docker cp "$($COMPOSE ps -q redis):/data/dump.rdb" "${BACKUP_PATH}/redis.rdb" 2>/dev/null; then
    info "Redis snapshot captured"
  else
    warn "Redis snapshot not captured (no dump.rdb) — queued jobs/reminder state won't be in this backup"
  fi
else
  warn "Redis unreachable — queued jobs/reminder state won't be in this backup"
fi

# ── Secrets (.env) ────────────────────────────────────────────────────────────
# A backup you can't decrypt/restore against is not a backup: without .env the
# database password, JWT secrets and MinIO credentials are gone with the server.
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -pass env:BACKUP_PASSPHRASE \
    -in .env -out "${BACKUP_PATH}/env.enc"
  info "Included .env (encrypted with BACKUP_PASSPHRASE)"
else
  cp .env "${BACKUP_PATH}/env.plain"
  warn "Included .env UNENCRYPTED (set BACKUP_PASSPHRASE in .env to encrypt it) — store backups securely"
fi

# ── Manifest ──────────────────────────────────────────────────────────────────
APP_VERSION=$(grep -m1 '"version"' packages/api/package.json | sed 's/[^0-9.]//g' || echo "unknown")
LATEST_MIGRATION=$($COMPOSE exec -T postgres psql -U "${POSTGRES_USER:-taskflow}" -d "${POSTGRES_DB:-taskflow}" -t -A \
  -c "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1;" 2>/dev/null || echo "unknown")
cat > "${BACKUP_PATH}/manifest.json" <<MANIFEST
{
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "appVersion": "${APP_VERSION}",
  "latestMigration": "${LATEST_MIGRATION}",
  "contents": {
    "database": true,
    "files": $([ -d "${BACKUP_PATH}/files" ] && echo true || echo false),
    "redis": $([ -f "${BACKUP_PATH}/redis.rdb" ] && echo true || echo false),
    "env": "$([ -f "${BACKUP_PATH}/env.enc" ] && echo encrypted || echo plain)"
  }
}
MANIFEST

# ── Compress ─────────────────────────────────────────────────────────────────
info "Compressing backup..."
ARCHIVE="${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
tar -czf "$ARCHIVE" -C "$BACKUP_DIR" "$BACKUP_NAME"
rm -rf "$BACKUP_PATH"

ARCHIVE_SIZE=$(du -sh "$ARCHIVE" | cut -f1)
info "Backup saved: ${ARCHIVE} (${ARCHIVE_SIZE})"

# ── Optional: upload to S3 ────────────────────────────────────────────────────
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  info "Uploading backup to S3 bucket: ${BACKUP_S3_BUCKET}"
  aws s3 cp "$ARCHIVE" "s3://${BACKUP_S3_BUCKET}/taskflow/${BACKUP_NAME}.tar.gz"
  info "Upload complete"
fi

# ── Rotate old backups (keep last 7) ─────────────────────────────────────────
info "Rotating old backups (keeping 7 most recent)..."
ls -t "${BACKUP_DIR}"/taskflow_*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
REMAINING=$(ls "${BACKUP_DIR}"/taskflow_*.tar.gz 2>/dev/null | wc -l)
info "${REMAINING} backup(s) retained"

echo ""
info "Backup complete: ${ARCHIVE}"
