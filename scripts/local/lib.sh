# Shared helpers for scripts/local/*.sh; source it, don't run it.

ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# wait_dynamodb [endpoint]: until DynamoDB Local answers (default AWS_ENDPOINT_URL_DYNAMODB).
wait_dynamodb() {
  echo "==> Wait for DynamoDB Local"
  "${ROOT}/node_modules/.bin/tsx" "${ROOT}/scripts/local/wait-dynamodb.ts" "$@"
}

# wait_http <url> <label> [tries]: until <url> answers 2xx, polling every
# 0.25 s (40 tries, 10 s, by default).
wait_http() {
  local url="$1"
  local label="$2"
  for _ in $(seq 1 "${3:-40}"); do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  echo "${label} did not become ready: ${url}" >&2
  return 1
}
