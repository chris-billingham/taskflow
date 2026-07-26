#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
step()  { echo -e "\n${BLUE}==>${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Pin the production compose file. A bare `docker compose` also merges
# docker-compose.override.yml (a dev override), which would deploy dev servers,
# NODE_ENV=development, self-signed TLS and exposed debug ports into "production".
COMPOSE="docker compose -f docker-compose.yml"

# ── 1. Pre-flight checks ──────────────────────────────────────────────────────
step "Checking prerequisites"

if ! command -v docker &>/dev/null; then
  error "Docker is not installed. See https://docs.docker.com/get-docker/"
  exit 1
fi

if ! docker compose version &>/dev/null; then
  error "Docker Compose v2 is not available. Update Docker or install the plugin."
  exit 1
fi

if ! command -v openssl &>/dev/null; then
  error "openssl is required for secret generation."
  exit 1
fi

info "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"

# ── 2. Initialise .env ────────────────────────────────────────────────────────
step "Setting up environment"

if [ ! -f .env ]; then
  info "Creating .env from .env.example"
  cp .env.example .env

  info "Generating secrets"
  JWT_SECRET=$(openssl rand -hex 32)
  JWT_REFRESH_SECRET=$(openssl rand -hex 32)
  POSTGRES_PASSWORD=$(openssl rand -hex 16)
  REDIS_PASSWORD=$(openssl rand -hex 16)
  MINIO_ROOT_PASSWORD=$(openssl rand -hex 16)

  sed -i.bak \
    -e "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" \
    -e "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}|" \
    -e "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" \
    -e "s|REDIS_PASSWORD=.*|REDIS_PASSWORD=${REDIS_PASSWORD}|" \
    -e "s|MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}|" \
    -e "s|S3_SECRET_KEY=.*|S3_SECRET_KEY=${MINIO_ROOT_PASSWORD}|" \
    .env
  rm -f .env.bak
  info "Secrets written to .env"
else
  warn ".env already exists — skipping generation"
fi

# shellcheck disable=SC1091
source .env

if [ -z "${DOMAIN:-}" ] || [ "$DOMAIN" = "taskflow.example.com" ]; then
  read -rp "Enter your domain (e.g. taskflow.example.com): " DOMAIN
  sed -i.bak "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" .env && rm -f .env.bak

  # These two default to https://$DOMAIN in docker-compose.yml, but an explicit
  # value in .env overrides that — and a stale example domain in APP_URL would
  # send every password-reset and invite link to example.com.
  sed -i.bak \
    -e "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://${DOMAIN}|" \
    -e "s|^APP_URL=.*|APP_URL=https://${DOMAIN}|" \
    .env && rm -f .env.bak
fi

if [ -z "${ACME_EMAIL:-}" ] || [ "$ACME_EMAIL" = "admin@example.com" ]; then
  read -rp "Enter email for Let's Encrypt notifications: " ACME_EMAIL
  sed -i.bak "s|ACME_EMAIL=.*|ACME_EMAIL=${ACME_EMAIL}|" .env && rm -f .env.bak
fi

# Ask now rather than let the placeholder ship. Without an admin AND without
# SMTP configured, a forgotten password has no recovery path at all: reset mail
# can't be sent and no account can reset it from the console. The address only
# has to match the one you sign up with — the account is created as an admin.
if [ -z "${ADMIN_EMAILS:-}" ] || [ "$ADMIN_EMAILS" = "admin@example.com" ]; then
  echo ""
  echo "Instance administrators manage accounts deployment-wide (create, suspend,"
  echo "reset passwords). They get no extra access to anyone's tasks or projects."
  echo "This is also the only password-recovery path until SMTP is configured."
  read -rp "Enter admin email address(es), comma-separated: " ADMIN_EMAILS
  if [ -n "$ADMIN_EMAILS" ]; then
    sed -i.bak "s|ADMIN_EMAILS=.*|ADMIN_EMAILS=${ADMIN_EMAILS}|" .env && rm -f .env.bak
  else
    warn "No admin configured. Set ADMIN_EMAILS in .env and restart the API before signing up."
  fi
fi

source .env

# ── 3. Docker networking ──────────────────────────────────────────────────────
step "Preparing Docker network"
docker network create traefik 2>/dev/null && info "Created 'traefik' network" || info "'traefik' network already exists"

# ── 4. Build images ───────────────────────────────────────────────────────────
# Only api and web: `worker` deliberately shares the api IMAGE, and building both
# in parallel races two exports onto the same tag — on a cold cache that fails the
# build outright with `image "...": already exists`. The worker picks up the image
# api just built.
step "Building Docker images"
$COMPOSE build --parallel api web

# ── 5. Start infrastructure ───────────────────────────────────────────────────
step "Starting infrastructure services"
$COMPOSE up -d postgres redis minio traefik

info "Waiting for PostgreSQL to be ready..."
until $COMPOSE exec -T postgres pg_isready -U "${POSTGRES_USER:-taskflow}" &>/dev/null; do
  sleep 2
done
info "PostgreSQL is ready"

# ── 6. Run database migrations ────────────────────────────────────────────────
step "Running database migrations"
$COMPOSE run --rm \
  -e DATABASE_URL="postgresql://${POSTGRES_USER:-taskflow}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-taskflow}" \
  api \
  sh -c "npx prisma migrate deploy --schema prisma/schema.prisma"

# ── 7. Start all services ────────────────────────────────────────────────────
step "Starting all services"
$COMPOSE up -d

info "Waiting for API to be healthy..."
for i in $(seq 1 30); do
  if $COMPOSE exec -T api wget -qO- http://127.0.0.1:3001/health &>/dev/null 2>&1; then
    info "API is healthy"
    break
  fi
  [ "$i" -eq 30 ] && { error "API failed to become healthy"; $COMPOSE logs api; exit 1; }
  sleep 3
done

# ── 8. Done ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Taskflow installation complete!    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""
echo "  App:         https://${DOMAIN}"
echo ""
echo "  View logs:   make logs"
echo "  Status:      make status"
echo "  Backup:      make backup"
echo ""
