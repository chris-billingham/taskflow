#!/usr/bin/env bash
# Print the GitHub release notes for a version: its CHANGELOG.md section
# (`## [1.2.0] - 2026-10-02`) and how to install or upgrade to it.
#   scripts/ci/release-notes.sh 1.2.0
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

version=${1:?usage: $0 VERSION}
repo=${GITHUB_REPOSITORY:-chris-billingham/taskflow}
owner=${repo%%/*}
blob="https://github.com/${repo}/blob/v${version}"

# Everything between this version's heading and the next level-2 heading.
notes=$(awk -v v="$version" '
  /^## / { if (found) exit; if (index($0, "## [" v "]") == 1) { found = 1; next } }
  found { print }
' CHANGELOG.md)

if [ -n "${notes//[[:space:]]/}" ]; then
  printf '%s\n' "$notes"
else
  echo "See [CHANGELOG.md](${blob}/CHANGELOG.md) for what's changed."
fi

cat <<NOTES

---

**Upgrade** an existing install: \`scripts/upgrade.sh ${version}\` (or \`make upgrade version=${version}\`).
It backs up first and applies database migrations. See [Upgrading](${blob}/docs/admin-guide/upgrading.md).

**Images** (linux/amd64 and linux/arm64):
- \`ghcr.io/${owner}/taskflow-api:${version}\`
- \`ghcr.io/${owner}/taskflow-web:${version}\`
NOTES
