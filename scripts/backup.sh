#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Pin the production compose file (don't merge the dev override).
COMPOSE="docker compose -f docker-compose.yml"

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
# Clear any previous mirror inside the container first — otherwise objects deleted
# since the last backup linger and get re-captured into every future backup.
$COMPOSE exec -T minio rm -rf /tmp/minio-backup 2>/dev/null || true
# Use MinIO client inside container to mirror bucket to local path
$COMPOSE exec -T minio \
  sh -c "mc alias set local http://localhost:9000 ${MINIO_ROOT_USER:-taskflow-admin} ${MINIO_ROOT_PASSWORD} && \
         mc mirror local/${MINIO_BUCKET:-taskflow} /tmp/minio-backup/ --quiet" || warn "MinIO backup failed — continuing"

if $COMPOSE exec -T minio test -d /tmp/minio-backup 2>/dev/null; then
  docker cp "$($COMPOSE ps -q minio):/tmp/minio-backup" "${BACKUP_PATH}/files"
  FILES_SIZE=$(du -sh "${BACKUP_PATH}/files" 2>/dev/null | cut -f1 || echo "0")
  info "File backup complete (${FILES_SIZE})"
fi

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
