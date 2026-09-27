#!/usr/bin/env bash
# Boot the production docker-compose.yml with throwaway secrets, exactly as a
# fresh install would run it, so CI (and anyone locally) can test the shipped
# images end to end: Traefik on https://localhost, the migrate one-shot,
# Garage, api, worker and web.
#
#   scripts/ci/prod-stack.sh up     build images, start, wait until healthy
#   scripts/ci/prod-stack.sh logs   print every container's log
#   scripts/ci/prod-stack.sh down   remove containers, volumes and the env file
#
# Needs ports 80 and 443. Runs as its own compose project, so it never touches
# a real install's containers or volumes on the same machine.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

PROJECT=taskflow-ci
ENV_FILE=.ci.env
COMPOSE="docker compose -p ${PROJECT} --env-file ${ENV_FILE} -f docker-compose.yml"

write_env() {
  cp .env.example "$ENV_FILE"
  local tmp
  tmp=$(mktemp)
  sed \
    -e "s|^DOMAIN=.*|DOMAIN=localhost|" \
    -e "s|^ACME_EMAIL=.*|ACME_EMAIL=ci@taskflow.test|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" \
    -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$(openssl rand -hex 16)|" \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" \
    -e "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" \
    -e "s|^S3_ACCESS_KEY=.*|S3_ACCESS_KEY=GK$(openssl rand -hex 12)|" \
    -e "s|^S3_SECRET_KEY=.*|S3_SECRET_KEY=$(openssl rand -hex 32)|" \
    -e "s|^GARAGE_RPC_SECRET=.*|GARAGE_RPC_SECRET=$(openssl rand -hex 32)|" \
    -e "s|^ADMIN_EMAILS=.*|ADMIN_EMAILS=e2e-admin@taskflow.test|" \
    -e "s|^RATE_LIMIT_MULTIPLIER=.*|RATE_LIMIT_MULTIPLIER=100|" \
    -e "s|^REGISTRATION_MODE=.*|REGISTRATION_MODE=open|" \
    "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
  # The end-to-end suite logs in dozens of times from one IP; production
  # limits (5 logins per 15 minutes) are covered by the API's unit tests.
}

wait_for() {
  local url=$1 name=$2
  for _ in $(seq 1 90); do
    if curl -skf -o /dev/null "$url"; then
      echo "${name} is up"
      return 0
    fi
    sleep 2
  done
  echo "${name} did not come up at ${url}" >&2
  return 1
}

case "${1:-}" in
  up)
    [ -f "$ENV_FILE" ] || write_env
    docker network inspect traefik >/dev/null 2>&1 || docker network create traefik >/dev/null
    # api and web only: worker and migrate reuse the api image.
    $COMPOSE build api web
    $COMPOSE up -d
    wait_for https://localhost/health "API (via Traefik)"
    wait_for https://localhost/ "Web app (via Traefik)"
    $COMPOSE ps --format '{{.Service}}: {{.Status}}'
    ;;
  logs)
    $COMPOSE logs --no-color --timestamps
    ;;
  down)
    if [ -f "$ENV_FILE" ]; then
      $COMPOSE down -v --remove-orphans
      rm -f "$ENV_FILE"
    fi
    ;;
  *)
    echo "usage: $0 up|logs|down" >&2
    exit 2
    ;;
esac
