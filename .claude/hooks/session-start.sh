#!/bin/bash
# Cloud sessions only: install the Node version from .nvmrc and all workspace dependencies.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# The image's preinstalled Node can trail .nvmrc, and engine-strict rejects it.
export NVM_DIR="${NVM_DIR:-/opt/nvm}"
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"
# nvm's remote version lookup fails now and then; one failure here leaves the
# session with no node_modules.
for attempt in 1 2 3; do
  nvm install "$(cat .nvmrc)" >/dev/null && break
  [ "$attempt" = 3 ] && exit 1
  sleep $((attempt * 5))
done
nvm alias default "$(cat .nvmrc)" >/dev/null
node_bin="$(dirname "$(nvm which "$(cat .nvmrc)")")"
echo "export PATH=\"$node_bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
export PATH="$node_bin:$PATH"

# Chromium is preinstalled at PLAYWRIGHT_BROWSERS_PATH; skip browser downloads.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm install --no-audit --no-fund
# npm ci: an install would rewrite the mobile lockfile's workspace link metadata.
npm ci --prefix apps/mobile --no-audit --no-fund

# The image's Go fetches the toolchain services/api/go.mod pins (GOTOOLCHAIN=auto).
if command -v go >/dev/null; then
  go -C services/api mod download
  go -C services/api/tools mod download
fi

# The pre-push hook runs the scripts tests, and seed-shell's needs rsync.
if ! command -v rsync >/dev/null; then
  sudo apt-get update -qq >/dev/null && sudo apt-get install -y -qq rsync >/dev/null ||
    echo "session-start: could not install rsync" >&2
fi

# e2e and the API integration suite run DynamoDB Local in Docker, and the
# image's Chromium is a different build than the repo's Playwright downloads.
if command -v dockerd >/dev/null && ! docker info >/dev/null 2>&1; then
  sudo sh -c 'nohup dockerd >/var/log/dockerd.log 2>&1 &'
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
  docker info >/dev/null 2>&1 || echo "session-start: dockerd did not start" >&2
fi
if [ -x /opt/pw-browsers/chromium ]; then
  echo "export E2E_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium" >> "$CLAUDE_ENV_FILE"
fi
