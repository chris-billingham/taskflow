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
COMPOSE="docker compose -f docker-compose.yml"

if [ ! -f .env ]; then
  error ".env not found. Run install.sh first."
  exit 1
fi

# shellcheck disable=SC1091
source .env

info "Starting upgrade..."

# ── 1. Backup before upgrading ────────────────────────────────────────────────
info "Creating pre-upgrade backup..."
"$SCRIPT_DIR/backup.sh"

# ── 2. Pull latest images (or build if no registry) ──────────────────────────
if [ "${DOCKER_REGISTRY:-taskflow}" != "taskflow" ]; then
  info "Pulling latest images from registry..."
  $COMPOSE pull api web worker
else
  info "Building images from source..."
  $COMPOSE build --parallel --no-cache
fi

# ── 3. Run database migrations ────────────────────────────────────────────────
info "Running database migrations..."
$COMPOSE run --rm \
  -e DATABASE_URL="postgresql://${POSTGRES_USER:-taskflow}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-taskflow}" \
  api \
  sh -c "npx prisma migrate deploy --schema prisma/schema.prisma"

info "Migrations complete"

# ── 4. Rolling restart ────────────────────────────────────────────────────────
info "Restarting services with zero-downtime rolling update..."

# Restart worker first (no traffic impact)
info "Restarting worker..."
$COMPOSE up -d --no-deps worker
sleep 5

# Restart API
info "Restarting API..."
$COMPOSE up -d --no-deps api

# Wait for API to be healthy before restarting web
info "Waiting for API to be healthy..."
for i in $(seq 1 30); do
  if $COMPOSE exec -T api wget -qO- http://localhost:3001/health &>/dev/null 2>&1; then
    info "API is healthy"
    break
  fi
  [ "$i" -eq 30 ] && { error "API health check failed after restart"; $COMPOSE logs --tail=50 api; exit 1; }
  sleep 3
done

# Restart web last
info "Restarting web..."
$COMPOSE up -d --no-deps web

info "Upgrade complete."
echo ""
$COMPOSE ps
