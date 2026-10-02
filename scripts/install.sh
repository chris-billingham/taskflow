#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
step()  { echo -e "\n${BLUE}==>${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."
# shellcheck source=scripts/lib/release.sh
source "$SCRIPT_DIR/lib/release.sh"

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

if ! command -v curl &>/dev/null; then
  error "curl is required to look up the latest release."
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
  S3_ACCESS_KEY="GK$(openssl rand -hex 12)"
  S3_SECRET_KEY=$(openssl rand -hex 32)
  GARAGE_RPC_SECRET=$(openssl rand -hex 32)

  sed -i.bak \
    -e "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" \
    -e "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}|" \
    -e "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" \
    -e "s|REDIS_PASSWORD=.*|REDIS_PASSWORD=${REDIS_PASSWORD}|" \
    -e "s|S3_ACCESS_KEY=.*|S3_ACCESS_KEY=${S3_ACCESS_KEY}|" \
    -e "s|S3_SECRET_KEY=.*|S3_SECRET_KEY=${S3_SECRET_KEY}|" \
    -e "s|GARAGE_RPC_SECRET=.*|GARAGE_RPC_SECRET=${GARAGE_RPC_SECRET}|" \
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
if docker network create traefik >/dev/null 2>&1; then
  info "Created 'traefik' network"
else
  info "'traefik' network already exists"
fi

# ── 4. Images ─────────────────────────────────────────────────────────────────
# The latest release's images, or a build from this checkout when there's no
# release yet (or TASKFLOW_VERSION=local is already set).
step "Getting Docker images"
if [ -z "${TASKFLOW_VERSION:-}" ]; then
  TASKFLOW_VERSION=$(latest_release)
  if [ -z "$TASKFLOW_VERSION" ]; then
    warn "No published release found; building from this checkout instead."
    TASKFLOW_VERSION=local
  fi
  set_env TASKFLOW_VERSION "$TASKFLOW_VERSION"
fi

if [ "$TASKFLOW_VERSION" = local ]; then
  # api and web only: worker and migrate use the api image.
  TASKFLOW_BUILD_VERSION="$(git describe --tags --always 2>/dev/null || echo local)" \
    TASKFLOW_BUILD_COMMIT="$(git rev-parse HEAD 2>/dev/null || true)" \
    $COMPOSE build api web
else
  info "Taskflow ${TASKFLOW_VERSION}"
  $COMPOSE pull
fi

# ── 5. Start ──────────────────────────────────────────────────────────────────
# The migrate service creates the database schema before api and worker start.
step "Starting Taskflow"
$COMPOSE up -d

info "Waiting for API to be healthy..."
if ! wait_for_api >/dev/null; then
  error "API failed to become healthy"
  $COMPOSE logs api
  exit 1
fi
info "API is healthy"

# ── 6. Done ───────────────────────────────────────────────────────────────────
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
echo "  Upgrade:     make upgrade"
echo ""
