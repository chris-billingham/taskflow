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

BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  # List available backups and prompt
  BACKUP_DIR="${BACKUP_DIR:-./backups}"
  if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls "${BACKUP_DIR}"/*.tar.gz 2>/dev/null)" ]; then
    error "No backups found in ${BACKUP_DIR}"
    exit 1
  fi

  echo "Available backups:"
  ls -1t "${BACKUP_DIR}"/taskflow_*.tar.gz | head -10 | while read -r f; do
    SIZE=$(du -sh "$f" | cut -f1)
    echo "  ${f} (${SIZE})"
  done
  echo ""
  read -rp "Enter backup file path: " BACKUP_FILE
fi

if [ ! -f "$BACKUP_FILE" ]; then
  error "Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

if [ ! -f .env ]; then
  error ".env not found."
  exit 1
fi

# shellcheck disable=SC1091
source .env

# ── Extract and VERIFY before touching anything ───────────────────────────────
# The old flow dropped the database first and asked questions later; a corrupt
# or partial archive left you with no database at all.
info "Extracting and verifying backup..."
RESTORE_TMP=$(mktemp -d)
trap 'rm -rf "$RESTORE_TMP"' EXIT

if ! tar -xzf "$BACKUP_FILE" -C "$RESTORE_TMP"; then
  error "Archive is corrupt or unreadable — nothing has been touched."
  exit 1
fi
BACKUP_DIR_NAME=$(ls "$RESTORE_TMP")
RESTORE_PATH="${RESTORE_TMP}/${BACKUP_DIR_NAME}"

if [ ! -f "${RESTORE_PATH}/database.sql.gz" ]; then
  error "Archive contains no database dump — refusing to proceed."
  exit 1
fi
if ! gunzip -t "${RESTORE_PATH}/database.sql.gz" 2>/dev/null; then
  error "Database dump inside the archive is corrupt — nothing has been touched."
  exit 1
fi

if [ -f "${RESTORE_PATH}/manifest.json" ]; then
  info "Backup manifest:"
  sed 's/^/    /' "${RESTORE_PATH}/manifest.json"
fi

warn "This will REPLACE the current database and files."
read -rp "Type 'yes' to confirm: " CONFIRM
[ "$CONFIRM" != "yes" ] && { info "Restore cancelled."; exit 0; }

# Stop the app so it can't reconnect to Postgres between DROP and CREATE (which
# would make DROP DATABASE fail) or write into a half-restored schema.
info "Stopping application services during restore..."
$COMPOSE stop api worker 2>/dev/null || true

# ── Database restore ──────────────────────────────────────────────────────────
info "Restoring database..."

# Drop and recreate the database. ON_ERROR_STOP=1 makes psql exit non-zero on
# any SQL error so `set -e` aborts instead of falsely reporting success.
$COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-taskflow}" postgres <<-SQL
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${POSTGRES_DB:-taskflow}' AND pid <> pg_backend_pid();
  DROP DATABASE IF EXISTS "${POSTGRES_DB:-taskflow}";
  CREATE DATABASE "${POSTGRES_DB:-taskflow}";
SQL

gunzip -c "${RESTORE_PATH}/database.sql.gz" | \
  $COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-taskflow}" "${POSTGRES_DB:-taskflow}"

info "Database restored"

# ── Schema reconciliation ─────────────────────────────────────────────────────
# The dump carries the schema from WHEN THE BACKUP WAS TAKEN. If the images
# have moved on since, the app would boot new code against an old schema.
if $COMPOSE config --services 2>/dev/null | grep -qx api; then
  info "Applying any migrations newer than the backup..."
  $COMPOSE run --rm \
    -e DATABASE_URL="postgresql://${POSTGRES_USER:-taskflow}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-taskflow}" \
    api sh -c "npx prisma migrate deploy --schema prisma/schema.prisma"
else
  warn "No 'api' service in this compose file — run 'prisma migrate deploy' against the restored DB manually."
fi

# ── File restore (point-in-time) ──────────────────────────────────────────────
MINIO_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-minioadmin}"
BUCKET="${MINIO_BUCKET:-taskflow}"

if [ -d "${RESTORE_PATH}/files" ]; then
  info "Restoring uploaded files to MinIO..."

  CONTAINER_ID=$($COMPOSE ps -q minio)
  $COMPOSE exec -T minio rm -rf /tmp/restore-files 2>/dev/null || true
  docker cp "${RESTORE_PATH}/files" "${CONTAINER_ID}:/tmp/restore-files"

  # --remove makes this point-in-time: objects uploaded AFTER the backup are
  # deleted, so the bucket matches the database being restored (no orphaned
  # attachment bytes, no rows pointing at future files).
  $COMPOSE exec -T minio \
    sh -c "mc alias set local http://localhost:9000 '${MINIO_USER}' '${MINIO_PASS}' >/dev/null && \
           mc mb --ignore-existing local/${BUCKET} && \
           mc mirror --overwrite --remove /tmp/restore-files/ local/${BUCKET}/ --quiet"

  info "Files restored"
else
  warn "No file backup in archive — bucket left as-is (attachments uploaded after this backup may be orphaned)"
fi

# ── Redis ─────────────────────────────────────────────────────────────────────
# Stale sessions and queued jobs reference the pre-restore world (deleted rows,
# revoked tokens). Flush so the restored database is the single source of truth;
# users simply sign in again.
info "Clearing Redis state..."
REDIS_CLI="redis-cli"
[ -n "${REDIS_PASSWORD:-}" ] && REDIS_CLI="redis-cli -a ${REDIS_PASSWORD}"
$COMPOSE exec -T redis sh -c "$REDIS_CLI FLUSHALL" >/dev/null 2>&1 || warn "Could not flush Redis — clear it manually"

info "Restore complete. Starting application services..."
$COMPOSE up -d api worker 2>/dev/null || true

info "Done."
