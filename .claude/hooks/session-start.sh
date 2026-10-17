#!/bin/bash
# Cloud sessions only: install the Node version from .nvmrc and all workspace
# dependencies, then the tools the tests need. A failed step doesn't stop the
# later ones; the hook exits non-zero once they have run.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 1

NVM_VERSION=v0.40.8
export NVM_DIR="${NVM_DIR:-/opt/nvm}"
NODE_VERSION="$(cat .nvmrc)"
status=0

# Some images ship no nvm.
install_nvm() {
  [ -s "$NVM_DIR/nvm.sh" ] && return 0
  local src="$NVM_DIR/.nvm-$NVM_VERSION"
  mkdir -p "$NVM_DIR" &&
    rm -rf "$src" &&
    git -c advice.detachedHead=false clone --quiet --depth 1 \
      --branch "$NVM_VERSION" https://github.com/nvm-sh/nvm.git "$src" &&
    cp -R "$src/." "$NVM_DIR/" &&
    rm -rf "$src" "$NVM_DIR/.git"
}

# The image's preinstalled Node can trail .nvmrc, and engine-strict rejects it.
# Prints the bin directory of the installed Node.
install_node() {
  install_nvm || return 1
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh" --no-use || return 1
  local attempt
  # nvm's remote version lookup fails now and then.
  for attempt in 1 2 3; do
    nvm install "$NODE_VERSION" >/dev/null && break
    [ "$attempt" = 3 ] && return 1
    sleep $((attempt * 5))
  done
  nvm alias default "$NODE_VERSION" >/dev/null || return 1
  dirname "$(nvm which "$NODE_VERSION")"
}

install_dependencies() {
  # Chromium is preinstalled at PLAYWRIGHT_BROWSERS_PATH; skip browser downloads.
  export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
  # npm ci: an install can rewrite either lockfile, and the pre-push hook
  # refuses a dirty working tree.
  npm ci --no-audit --no-fund &&
    npm ci --prefix apps/mobile --no-audit --no-fund
}

if node_bin="$(install_node)" && [ -x "$node_bin/node" ]; then
  echo "export PATH=\"$node_bin:\$PATH\"" >>"$CLAUDE_ENV_FILE"
  export PATH="$node_bin:$PATH"
  install_dependencies || {
    echo "session-start: npm install failed" >&2
    status=1
  }
else
  echo "session-start: could not install Node $NODE_VERSION with nvm in $NVM_DIR" >&2
  status=1
fi

# The image's Go fetches the toolchain services/api/go.mod pins (GOTOOLCHAIN=auto).
if command -v go >/dev/null; then
  { go -C services/api mod download && go -C services/api/tools mod download; } || {
    echo "session-start: go mod download failed" >&2
    status=1
  }
fi

# The pre-push hook runs the scripts tests, and seed-shell's needs rsync.
if ! command -v rsync >/dev/null; then
  { sudo apt-get update -qq >/dev/null && sudo apt-get install -y -qq rsync >/dev/null; } ||
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
  echo "export E2E_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium" >>"$CLAUDE_ENV_FILE"
fi

exit "$status"
