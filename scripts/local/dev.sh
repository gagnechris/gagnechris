#!/usr/bin/env bash
# One-command local admin: DynamoDB Local + API wrapper + Vite.
# Usage: npm run local:dev
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

# shellcheck source=env.sh
source "${ROOT}/scripts/local/env.sh"

API_PID=""
STARTED_API=0

cleanup() {
  if [[ "${STARTED_API}" -eq 1 && -n "${API_PID}" ]] && kill -0 "${API_PID}" 2>/dev/null; then
    echo ""
    echo "==> Stopping local API (pid ${API_PID})"
    kill "${API_PID}" 2>/dev/null || true
    wait "${API_PID}" 2>/dev/null || true
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

wait_api() {
  for i in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:${LOCAL_API_PORT}/api/health" >/dev/null; then
      return 0
    fi
    sleep 0.25
  done
  echo "Local API did not become ready on :${LOCAL_API_PORT}" >&2
  exit 1
}

echo "==> DynamoDB Local"
docker compose -f docker-compose.local.yml up -d
wait_dynamodb

echo "==> Bootstrap table ${DATA_TABLE_NAME}"
node scripts/local/bootstrap-table.mjs

if curl -sf "http://127.0.0.1:${LOCAL_API_PORT}/api/health" >/dev/null 2>&1; then
  echo "==> Local API already running on :${LOCAL_API_PORT}"
else
  echo "==> Start local API on :${LOCAL_API_PORT}"
  npx tsx services/api/local/server.ts &
  API_PID=$!
  STARTED_API=1
  wait_api
fi

echo ""
echo "Local admin ready:"
echo "  Vite → http://localhost:5173/admin"
echo "  API  → http://127.0.0.1:${LOCAL_API_PORT}"
echo "  Auth → VITE_AUTH_MODE=local (no Cognito)"
echo "Ctrl+C stops Vite${STARTED_API:+ and the API this script started}."
echo ""

npm run dev -w @gagnechris/web
