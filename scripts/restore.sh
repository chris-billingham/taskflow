#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

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

warn "This will REPLACE the current database and files."
read -rp "Type 'yes' to confirm: " CONFIRM
[ "$CONFIRM" != "yes" ] && { info "Restore cancelled."; exit 0; }

# ── Extract ───────────────────────────────────────────────────────────────────
info "Extracting backup..."
RESTORE_TMP=$(mktemp -d)
trap 'rm -rf "$RESTORE_TMP"' EXIT

tar -xzf "$BACKUP_FILE" -C "$RESTORE_TMP"
BACKUP_DIR_NAME=$(ls "$RESTORE_TMP")
RESTORE_PATH="${RESTORE_TMP}/${BACKUP_DIR_NAME}"

# ── Database restore ──────────────────────────────────────────────────────────
if [ -f "${RESTORE_PATH}/database.sql.gz" ]; then
  info "Restoring database..."

  # Drop and recreate the database
  docker compose exec -T postgres psql -U "${POSTGRES_USER:-taskflow}" postgres <<-SQL
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${POSTGRES_DB:-taskflow}';
    DROP DATABASE IF EXISTS "${POSTGRES_DB:-taskflow}";
    CREATE DATABASE "${POSTGRES_DB:-taskflow}";
SQL

  gunzip -c "${RESTORE_PATH}/database.sql.gz" | \
    docker compose exec -T postgres psql -U "${POSTGRES_USER:-taskflow}" "${POSTGRES_DB:-taskflow}"

  info "Database restored"
else
  warn "No database backup found in archive — skipping"
fi

# ── File restore ──────────────────────────────────────────────────────────────
if [ -d "${RESTORE_PATH}/files" ]; then
  info "Restoring uploaded files to MinIO..."

  CONTAINER_ID=$(docker compose ps -q minio)
  docker cp "${RESTORE_PATH}/files" "${CONTAINER_ID}:/tmp/restore-files"

  docker compose exec -T minio \
    sh -c "mc alias set local http://localhost:9000 ${MINIO_ROOT_USER:-taskflow-admin} ${MINIO_ROOT_PASSWORD} && \
           mc mirror --overwrite /tmp/restore-files/ local/${MINIO_BUCKET:-taskflow}/ --quiet"

  info "Files restored"
else
  warn "No file backup found in archive — skipping"
fi

info "Restore complete. Restarting API..."
docker compose restart api worker

info "Done."
