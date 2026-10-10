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
nvm install "$(cat .nvmrc)" >/dev/null
nvm alias default "$(cat .nvmrc)" >/dev/null
node_bin="$(dirname "$(nvm which "$(cat .nvmrc)")")"
echo "export PATH=\"$node_bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
export PATH="$node_bin:$PATH"

# Chromium is preinstalled at PLAYWRIGHT_BROWSERS_PATH; skip browser downloads.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm install --no-audit --no-fund
# npm ci: an install would rewrite the mobile lockfile's workspace link metadata.
npm ci --prefix apps/mobile --no-audit --no-fund

# The image's Go fetches the toolchain go/go.mod pins (GOTOOLCHAIN=auto).
if command -v go >/dev/null; then
  go -C go mod download
  go -C go/tools mod download
fi
