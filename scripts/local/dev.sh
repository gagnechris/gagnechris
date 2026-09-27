#!/usr/bin/env bash
# One-command local admin: DynamoDB Local + API + static site + Vite.
# Usage: npm run local:dev
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

# shellcheck source=env.sh
source "${ROOT}/scripts/local/env.sh"

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

wait_dynamodb() {
  echo "==> Wait for DynamoDB Local"
  for i in $(seq 1 60); do
    if node -e "
      import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
      const c = new DynamoDBClient({
        region: 'us-east-1',
        endpoint: process.env.AWS_ENDPOINT_URL_DYNAMODB || 'http://127.0.0.1:8000',
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      });
      await c.send(new ListTablesCommand({}));
    " 2>/dev/null; then
      return 0
    fi
    sleep 0.5
  done
  echo "DynamoDB Local did not become ready on :8000" >&2
  exit 1
}

wait_http() {
  local url="$1"
  local label="$2"
  for i in $(seq 1 40); do
    if curl -sf "$url" >/dev/null; then
      return 0
    fi
    sleep 0.25
  done
  echo "${label} did not become ready: ${url}" >&2
  exit 1
}

ensure_shell() {
  mkdir -p "${SITE_BUCKET_NAME}"
  if [[ -f "${ROOT}/apps/web/dist/index.html" ]]; then
    echo "==> Seed site shell from apps/web/dist"
    bash "${ROOT}/scripts/local/seed-shell.sh"
  elif [[ ! -f "${SITE_BUCKET_NAME}/index.html" ]]; then
    echo "==> Write minimal publisher shell (run npm run build later for full assets)"
    cat > "${SITE_BUCKET_NAME}/index.html" <<'HTML'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chris Gagne</title>
    <meta name="description" content="" />
    <meta property="og:title" content="" />
    <meta property="og:description" content="" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="" />
    <meta property="og:image" content="" />
    <meta name="twitter:title" content="" />
    <meta name="twitter:description" content="" />
    <meta name="twitter:image" content="" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
HTML
  else
    echo "==> Site shell already present at ${SITE_BUCKET_NAME}"
  fi
}

echo "==> DynamoDB Local"
docker compose -f docker-compose.local.yml up -d
wait_dynamodb

echo "==> Bootstrap table ${DATA_TABLE_NAME}"
node scripts/local/bootstrap-table.mjs

ensure_shell
echo "==> Site root ${SITE_BUCKET_NAME}"

if curl -sf "http://127.0.0.1:${LOCAL_API_PORT}/api/health" >/dev/null 2>&1; then
  echo "==> Local API already running on :${LOCAL_API_PORT}"
else
  echo "==> Start local API on :${LOCAL_API_PORT}"
  npx tsx services/api/local/server.ts &
  API_PID=$!
  STARTED_API=1
  wait_http "http://127.0.0.1:${LOCAL_API_PORT}/api/health" "local API"
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
echo "Local admin ready:"
echo "  Vite     → http://localhost:5173/admin"
echo "  /blog/*  → proxied to :${LOCAL_SITE_PORT} (publisher HTML)"
echo "  API      → http://127.0.0.1:${LOCAL_API_PORT}"
echo "  Auth     → VITE_AUTH_MODE=local (no Cognito)"
echo "Ctrl+C stops Vite and processes this script started."
echo ""

npm run dev -w @gagnechris/web
