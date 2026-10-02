# shellcheck shell=bash
# Helpers shared by install.sh and upgrade.sh. Source from the repository root.

# Where releases are published (GitHub releases and GHCR images).
TASKFLOW_REPO="${TASKFLOW_REPO:-chris-billingham/taskflow}"

# The newest published release, without the leading "v" (e.g. 1.2.0), or
# nothing if there's none or GitHub can't be reached. Pre-releases are skipped.
latest_release() {
  curl -fsSL "https://api.github.com/repos/${TASKFLOW_REPO}/releases/latest" 2>/dev/null |
    sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -n 1
}

# Set KEY=VALUE in .env, replacing the line if there is one.
set_env() {
  local key=$1 value=$2
  if grep -q "^${key}=" .env; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" .env && rm -f .env.bak
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

# Wait for the API's own health check and print its response.
wait_for_api() {
  local body
  for _ in $(seq 1 40); do
    if body=$($COMPOSE exec -T api wget -qO- http://127.0.0.1:3001/health 2>/dev/null); then
      echo "$body"
      return 0
    fi
    sleep 3
  done
  return 1
}
