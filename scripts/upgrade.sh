#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Pin the production compose file so the dev override (docker-compose.override.yml)
# is never merged into an upgrade.
COMPOSE="docker compose -f ${TASKFLOW_COMPOSE_FILE:-docker-compose.yml}"

if [ ! -f .env ]; then
  error ".env not found. Run install.sh first."
  exit 1
fi

# shellcheck disable=SC1091
source .env

REGISTRY="${DOCKER_REGISTRY:-taskflow}"
TAG="${IMAGE_TAG:-latest}"
API_IMAGE="${REGISTRY}/api:${TAG}"
WEB_IMAGE="${REGISTRY}/web:${TAG}"

info "Starting upgrade..."

# ── 1. Fetch the new source ───────────────────────────────────────────────────
# Building "from source" without pulling rebuilds the code you already run.
if [ -d .git ] && [ -z "${TASKFLOW_SKIP_GIT_PULL:-}" ]; then
  info "Pulling latest source (git pull --ff-only)..."
  git pull --ff-only || {
    error "git pull failed (local changes or diverged branch). Resolve it, or set TASKFLOW_SKIP_GIT_PULL=1 to upgrade from the current checkout."
    exit 1
  }
fi

# ── 2. Backup before upgrading ────────────────────────────────────────────────
info "Creating pre-upgrade backup..."
"$SCRIPT_DIR/backup.sh"

# ── 3. Preserve the running images for rollback ───────────────────────────────
# Rebuilding over the same tag turns the current (known-good) images into
# untagged danglers BEFORE the new build proves itself. Tag them first so a
# failed upgrade has something to roll back to.
for img in "$API_IMAGE" "$WEB_IMAGE"; do
  if docker image inspect "$img" >/dev/null 2>&1; then
    docker tag "$img" "${img%:*}:rollback"
    info "Tagged ${img} as ${img%:*}:rollback"
  fi
done

rollback() {
  error "Upgrade failed — rolling back to the previous images..."
  for img in "$API_IMAGE" "$WEB_IMAGE"; do
    if docker image inspect "${img%:*}:rollback" >/dev/null 2>&1; then
      docker tag "${img%:*}:rollback" "$img"
    fi
  done
  $COMPOSE up -d --no-deps worker api web
  warn "Previous images restored and restarted."
  warn "NOTE: database migrations applied by this upgrade are NOT rolled back."
  warn "If the old code cannot run on the new schema, restore the pre-upgrade backup: make restore"
  exit 1
}

# ── 4. Pull latest images (or build if no registry) ──────────────────────────
if [ "$REGISTRY" != "taskflow" ]; then
  info "Pulling latest images from registry..."
  $COMPOSE pull api web worker
else
  info "Building images from source..."
  $COMPOSE build --parallel --no-cache
fi

# ── 5. Run database migrations ────────────────────────────────────────────────
info "Running database migrations..."
$COMPOSE run --rm \
  -e DATABASE_URL="postgresql://${POSTGRES_USER:-taskflow}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-taskflow}" \
  api \
  sh -c "npx prisma migrate deploy --schema prisma/schema.prisma" || rollback

info "Migrations complete"

# ── 6. Restart services ───────────────────────────────────────────────────────
# Single-replica compose: each service restarts with a brief outage (~seconds).
info "Restarting services..."

info "Restarting worker..."
$COMPOSE up -d --no-deps worker
sleep 5

info "Restarting API..."
$COMPOSE up -d --no-deps api

info "Waiting for API to be healthy..."
for i in $(seq 1 30); do
  if $COMPOSE exec -T api wget -qO- http://localhost:3001/health &>/dev/null 2>&1; then
    info "API is healthy"
    break
  fi
  if [ "$i" -eq 30 ]; then
    $COMPOSE logs --tail=50 api
    rollback
  fi
  sleep 3
done

info "Restarting web..."
$COMPOSE up -d --no-deps web

info "Upgrade complete."
echo ""
$COMPOSE ps
