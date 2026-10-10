#!/usr/bin/env bash
# Usage: npm run local:dev
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

# shellcheck source=env.sh
source "${ROOT}/scripts/local/env.sh"
# shellcheck source=lib.sh
source "${ROOT}/scripts/local/lib.sh"

API_PID=""
SITE_PID=""
STARTED_API=0
STARTED_SITE=0

cleanup() {
  if [[ "${STARTED_API}" -eq 1 && -n "${API_PID}" ]] && kill -0 "${API_PID}" 2>/dev/null; then
    echo ""
    echo "==> Stopping local API (pid ${API_PID})"
    kill "${API_PID}" 2>/dev/null || true
    wait "${API_PID}" 2>/dev/null || true
  fi
  if [[ "${STARTED_SITE}" -eq 1 && -n "${SITE_PID}" ]] && kill -0 "${SITE_PID}" 2>/dev/null; then
    echo "==> Stopping local site (pid ${SITE_PID})"
    kill "${SITE_PID}" 2>/dev/null || true
    wait "${SITE_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

ensure_shell() {
  mkdir -p "${SITE_BUCKET_NAME}"
  if [[ -f "${ROOT}/apps/web/dist/index.html" ]]; then
    echo "==> Seed site shell from apps/web/dist"
    bash "${ROOT}/scripts/local/seed-shell.sh"
  elif [[ ! -f "${SITE_BUCKET_NAME}/index.html" ]]; then
    echo "==> Write minimal publisher shell (run npm run build later for full assets)"
    cp "${ROOT}/scripts/local/minimal-shell.html" "${SITE_BUCKET_NAME}/index.html"
    cp "${SITE_BUCKET_NAME}/index.html" "${SITE_BUCKET_NAME}/_shell.html"
  else
    echo "==> Site shell already present at ${SITE_BUCKET_NAME}"
  fi
}

echo "==> DynamoDB Local"
docker compose -f docker-compose.local.yml up -d
wait_dynamodb

echo "==> Bootstrap table ${DATA_TABLE_NAME}"
npx tsx scripts/local/bootstrap-table.ts

ensure_shell
echo "==> Site root ${SITE_BUCKET_NAME}"

if curl -sf "http://127.0.0.1:${LOCAL_API_PORT}/api/health" >/dev/null 2>&1; then
  echo "==> Local API already running on :${LOCAL_API_PORT}"
else
  if [[ "${API_SERVER:-node}" == "go" ]]; then
    echo "==> Start local Go API on :${LOCAL_API_PORT} (Node behind it for routes Go doesn't serve)"
    npx tsx services/api/local/go-api.ts local &
  else
    echo "==> Start local API on :${LOCAL_API_PORT} (tsx watch)"
    # Without watch, new routes 404 against a stale process until restart.
    npx tsx watch --clear-screen=false services/api/local/server.ts &
  fi
  API_PID=$!
  STARTED_API=1
  # The Go API builds first.
  wait_http "http://127.0.0.1:${LOCAL_API_PORT}/api/health" "local API" 240 || exit 1
fi

site_listening() {
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${LOCAL_SITE_PORT}/" 2>/dev/null || true)"
  [[ "${code}" == "200" || "${code}" == "404" ]]
}

if site_listening; then
  echo "==> Local site already running on :${LOCAL_SITE_PORT}"
else
  echo "==> Start local site on :${LOCAL_SITE_PORT}"
  npx tsx services/api/local/static-server.ts &
  SITE_PID=$!
  STARTED_SITE=1
  for i in $(seq 1 40); do
    if site_listening; then
      break
    fi
    sleep 0.25
    if [[ "$i" -eq 40 ]]; then
      echo "Local site did not become ready on :${LOCAL_SITE_PORT}" >&2
      exit 1
    fi
  done
fi

echo "==> Rebuild published site from DynamoDB"
npx tsx scripts/local/rebuild-site.ts

echo ""
echo "Local stack ready:"
echo "  Public   → http://localhost:5173"
echo "  Admin    → http://localhost:5174"
echo "  Notebook → http://localhost:5175"
echo "  /__site  → proxied to :${LOCAL_SITE_PORT} (publisher HTML, /posts/*)"
echo "  API      → http://127.0.0.1:${LOCAL_API_PORT}"
echo "  Auth     → VITE_AUTH_MODE=local (no Cognito)"
echo "Ctrl+C stops Vite and processes this script started."
echo ""

npm run dev -w @gagnechris/web
