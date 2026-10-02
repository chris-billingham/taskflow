#!/usr/bin/env bash
# Upgrade Taskflow to a release, or rebuild it from this checkout.
#
#   scripts/upgrade.sh            the latest release
#   scripts/upgrade.sh 1.2.0      a chosen release (also how to go back to one)
#   scripts/upgrade.sh --build    build images from the current checkout
#
# Backs up first, applies database migrations, and goes back to the previous
# version if the new one doesn't start.
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."
# shellcheck source=scripts/lib/release.sh
source "$SCRIPT_DIR/lib/release.sh"

# Pin the production compose file so the dev override (docker-compose.override.yml)
# is never merged into an upgrade.
COMPOSE="docker compose -f ${TASKFLOW_COMPOSE_FILE:-docker-compose.yml}"

if [ ! -f .env ]; then
  error ".env not found. Run install.sh first."
  exit 1
fi

# shellcheck disable=SC1091
source .env

# Object storage moved from MinIO (images withdrawn upstream) to Garage, which
# needs its own key format and an RPC secret. Stop before touching anything.
if [ -z "${GARAGE_RPC_SECRET:-}" ] || [ "${GARAGE_RPC_SECRET}" = "change-me" ]; then
  error "This .env predates the switch from MinIO to Garage."
  error "Add S3_ACCESS_KEY (GK + 24 hex), S3_SECRET_KEY (64 hex) and GARAGE_RPC_SECRET"
  error "(64 hex) as described in .env.example, move existing attachments across"
  error "(see docs/admin-guide/upgrading.md), then run this again."
  exit 1
fi

REGISTRY="${TASKFLOW_REGISTRY:-ghcr.io/chris-billingham}"
PREVIOUS="${TASKFLOW_VERSION:-}"
TARGET="${1:-}"
BUILD=""
if [ "$TARGET" = "--build" ]; then
  BUILD=1
  TARGET=local
fi
TARGET="${TARGET#v}"

if [ -z "$BUILD" ]; then
  if [ -z "$TARGET" ]; then
    TARGET=$(latest_release)
    if [ -z "$TARGET" ]; then
      error "Couldn't look up the latest release (https://github.com/${TASKFLOW_REPO}/releases)."
      error "Name one instead, e.g. $0 1.2.0"
      exit 1
    fi
  fi
  if ! [[ "$TARGET" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]]; then
    error "\"$TARGET\" isn't a version. Use one like 1.2.0, or --build."
    exit 1
  fi
fi

# ── 1. Match this checkout to the release ─────────────────────────────────────
# The compose file and these scripts belong to a release as much as its images.
if [ -z "$BUILD" ] && [ -d .git ] && [ -z "${TASKFLOW_UPGRADE_CHECKED_OUT:-}" ]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    error "This checkout has local changes. Commit or stash them, then run this again."
    exit 1
  fi
  info "Fetching release v${TARGET}..."
  git fetch --quiet --tags origin
  from_ref=$(git symbolic-ref -q --short HEAD || git rev-parse HEAD)
  git -c advice.detachedHead=false checkout --quiet "v${TARGET}"
  # Carry on with the release's own copy of this script.
  exec env TASKFLOW_UPGRADE_CHECKED_OUT=1 TASKFLOW_UPGRADE_FROM_REF="$from_ref" \
    "$SCRIPT_DIR/upgrade.sh" "$TARGET"
fi

# Put the checkout back where it was (after a failed upgrade).
restore_checkout() {
  if [ -n "${TASKFLOW_UPGRADE_FROM_REF:-}" ]; then
    git -c advice.detachedHead=false checkout --quiet "$TASKFLOW_UPGRADE_FROM_REF" || true
  fi
}

info "Upgrading Taskflow from ${PREVIOUS:-an unversioned install} to ${TARGET}"

# ── 2. Backup ─────────────────────────────────────────────────────────────────
info "Creating pre-upgrade backup..."
"$SCRIPT_DIR/backup.sh"

rollback() {
  error "Version ${TARGET} didn't start."
  case "$PREVIOUS" in
    "")
      restore_checkout
      warn "There's no earlier release to go back to automatically."
      warn "Restore the pre-upgrade backup with: make restore"
      ;;
    local)
      for name in taskflow-api taskflow-web; do
        docker image inspect "${REGISTRY}/${name}:rollback" >/dev/null 2>&1 &&
          docker tag "${REGISTRY}/${name}:rollback" "${REGISTRY}/${name}:local"
      done
      set_env TASKFLOW_VERSION local
      $COMPOSE up -d --no-deps worker api web
      warn "Restarted the images that were running before."
      ;;
    *)
      set_env TASKFLOW_VERSION "$PREVIOUS"
      restore_checkout
      $COMPOSE up -d --no-deps worker api web
      warn "Back on ${PREVIOUS}."
      ;;
  esac
  warn "Database migrations this upgrade applied are NOT undone. If the old version"
  warn "can't run on the new schema, restore the pre-upgrade backup: make restore"
  exit 1
}

# ── 3. Get the images ─────────────────────────────────────────────────────────
# Settings from before versioned releases; the compose file no longer reads them.
sed -i.bak -e '/^DOCKER_REGISTRY=/d' -e '/^IMAGE_TAG=/d' .env && rm -f .env.bak

if [ -n "$BUILD" ]; then
  # Keep what's running, to go back to if the new build doesn't start.
  if [ "$PREVIOUS" = local ]; then
    for name in taskflow-api taskflow-web; do
      docker image inspect "${REGISTRY}/${name}:local" >/dev/null 2>&1 &&
        docker tag "${REGISTRY}/${name}:local" "${REGISTRY}/${name}:rollback"
    done
  fi
  set_env TASKFLOW_VERSION local
  info "Building images from this checkout..."
  # api and web only: worker and migrate use the api image.
  TASKFLOW_BUILD_VERSION="$(git describe --tags --always 2>/dev/null || echo local)" \
    TASKFLOW_BUILD_COMMIT="$(git rev-parse HEAD 2>/dev/null || true)" \
    $COMPOSE build api web
else
  set_env TASKFLOW_VERSION "$TARGET"
  info "Pulling ${TARGET} images..."
  if ! $COMPOSE pull migrate api worker web; then
    set_env TASKFLOW_VERSION "$PREVIOUS"
    restore_checkout
    error "Couldn't pull the ${TARGET} images. Nothing was changed."
    exit 1
  fi
fi

# ── 4. Migrate and restart ────────────────────────────────────────────────────
# The migrate service runs first; api and worker start only once it succeeds.
# Single-replica compose: each service restarts with a brief outage (seconds).
info "Applying migrations and restarting..."
$COMPOSE up -d --remove-orphans || rollback

info "Waiting for the API..."
health=$(wait_for_api) || { $COMPOSE logs --tail=50 api; rollback; }
if [ -z "$BUILD" ] && ! grep -q "\"version\":\"${TARGET}\"" <<<"$health"; then
  error "The API is up but reports: ${health}"
  rollback
fi

info "Taskflow ${TARGET} is running."
echo ""
$COMPOSE ps
