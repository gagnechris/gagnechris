#!/usr/bin/env bash
# CHR-75 local E2E: DynamoDB Local → API wrapper → publisher → static server.
# Does not use AWS profiles or touch gagnechris-prod.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

# shellcheck source=env.sh
source "${ROOT}/scripts/local/env.sh"

if [[ -n "${AWS_PROFILE:-}" ]]; then
  echo "AWS_PROFILE must be unset for local E2E (got ${AWS_PROFILE})" >&2
  exit 1
fi
if [[ "${DATA_TABLE_NAME}" == "gagnechris-prod" ]]; then
  echo "Refusing DATA_TABLE_NAME=gagnechris-prod" >&2
  exit 1
fi

API_PID=""
SITE_PID=""
cleanup() {
  if [[ -n "${API_PID}" ]] && kill -0 "${API_PID}" 2>/dev/null; then
    kill "${API_PID}" 2>/dev/null || true
  fi
  if [[ -n "${SITE_PID}" ]] && kill -0 "${SITE_PID}" 2>/dev/null; then
    kill "${SITE_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "==> DynamoDB Local"
docker compose -f docker-compose.local.yml up -d

echo "==> Wait for DynamoDB Local"
for i in $(seq 1 60); do
  if AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local \
    AWS_REGION=us-east-1 AWS_ENDPOINT_URL_DYNAMODB=http://127.0.0.1:8000 \
    node -e "
      import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
      const c = new DynamoDBClient({
        region: 'us-east-1',
        endpoint: 'http://127.0.0.1:8000',
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      });
      await c.send(new ListTablesCommand({}));
    " 2>/dev/null; then
    break
  fi
  sleep 0.5
  if [[ "$i" -eq 60 ]]; then
    echo "DynamoDB Local did not become ready on :8000" >&2
    exit 1
  fi
done

echo "==> Bootstrap table ${DATA_TABLE_NAME}"
node scripts/local/bootstrap-table.mjs

echo "==> Build web shell (if needed)"
if [[ ! -f apps/web/dist/index.html ]]; then
  VITE_COGNITO_USER_POOL_ID="${VITE_COGNITO_USER_POOL_ID:-us-east-1_ciPlaceholder}" \
  VITE_COGNITO_WEB_CLIENT_ID="${VITE_COGNITO_WEB_CLIENT_ID:-ciplaceholderclientid00000000}" \
  VITE_COGNITO_AUTH_DOMAIN="${VITE_COGNITO_AUTH_DOMAIN:-auth.example.com}" \
  npm run build
fi

echo "==> Seed site shell"
bash scripts/local/seed-shell.sh

# Plant an orphan page that rebuild must remove after publish of a different slug.
mkdir -p "${SITE_BUCKET_NAME}/blog/orphan-e2e"
echo '<html>orphan</html>' > "${SITE_BUCKET_NAME}/blog/orphan-e2e/index.html"

echo "==> Start local API + static site"
npx --yes tsx services/api/local/server.ts &
API_PID=$!
npx --yes tsx services/api/local/static-server.ts &
SITE_PID=$!

wait_http() {
  local url="$1"
  local label="$2"
  for i in $(seq 1 40); do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  echo "${label} did not become ready: ${url}" >&2
  return 1
}

wait_http "http://127.0.0.1:${LOCAL_API_PORT}/api/health" "local API"
# Static server returns 404 for missing paths with 200 only for files — probe index.
for i in $(seq 1 40); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${LOCAL_SITE_PORT}/" || true)"
  if [[ "${code}" == "200" ]]; then
    break
  fi
  sleep 0.25
  if [[ "$i" -eq 40 ]]; then
    echo "local site did not become ready" >&2
    exit 1
  fi
done

API="http://127.0.0.1:${LOCAL_API_PORT}"
SITE="http://127.0.0.1:${LOCAL_SITE_PORT}"
SLUG="local-e2e-$(date +%s)"

echo "==> Create + publish post ${SLUG}"
CREATE="$(curl -sS -X POST "${API}/api/admin/posts" \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"Local E2E Post\",\"slug\":\"${SLUG}\",\"excerpt\":\"Local excerpt\",\"bodyMarkdown\":\"## Hello\\n\\nLocal body.\"}")"
POST_ID="$(node -e "const p=JSON.parse(process.argv[1]); if(!p.id){console.error(p);process.exit(1)}; console.log(p.id)" "${CREATE}")"

PUBLISH="$(curl -sS -X POST "${API}/api/admin/posts/${POST_ID}/publish")"
node -e "const p=JSON.parse(process.argv[1]); if(p.status!=='published'){console.error(p);process.exit(1)}" "${PUBLISH}"

echo "==> Assert prerendered HTML + OG"
HTML="$(curl -sS "${SITE}/blog/${SLUG}")"
echo "${HTML}" | grep -q 'Local E2E Post'
echo "${HTML}" | grep -q 'property="og:title"'
echo "${HTML}" | grep -q 'class="blog-post-prerender"'
echo "${HTML}" | grep -q 'Local body'

echo "==> Seed + assert home prerender (CHR-92)"
HOME_JSON="$(curl -sS "${API}/api/admin/home")"
node -e "const h=JSON.parse(process.argv[1]); if(h.status!=='published'){console.error(h);process.exit(1)}" "${HOME_JSON}"
HOME_HTML="$(curl -sS "${SITE}/")"
echo "${HOME_HTML}" | grep -q 'class="home-page-prerender"'
echo "${HOME_HTML}" | grep -q 'About Me'
echo "${HOME_HTML}" | grep -q '<script type="module"'

echo "==> Home prerender must not leak into other pages"
POST_HTML="$(curl -sS "${SITE}/blog/${SLUG}")"
if echo "${POST_HTML}" | grep -q 'home-page-prerender'; then
  echo "Home prerender leaked into /blog/${SLUG}" >&2
  exit 1
fi
echo "${POST_HTML}" | grep -q 'class="blog-post-prerender"'

echo "==> Edit published title (no re-publish)"
VERSION="$(node -e "console.log(JSON.parse(process.argv[1]).version)" "${PUBLISH}")"
UPDATED="$(curl -sS -X PUT "${API}/api/admin/posts/${POST_ID}" \
  -H 'Content-Type: application/json' \
  -d "{\"version\":${VERSION},\"title\":\"Local E2E Updated\"}")"
node -e "const p=JSON.parse(process.argv[1]); if(p.title!=='Local E2E Updated'){console.error(p);process.exit(1)}" "${UPDATED}"

HTML2="$(curl -sS "${SITE}/blog/${SLUG}")"
echo "${HTML2}" | grep -q 'Local E2E Updated'

echo "==> Orphan cleanup"
ORPHAN_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "${SITE}/blog/orphan-e2e")"
if [[ "${ORPHAN_CODE}" != "404" ]]; then
  echo "Expected orphan-e2e to be removed (404), got ${ORPHAN_CODE}" >&2
  exit 1
fi

echo "==> Unpublish removes prerender"
curl -sS -X POST "${API}/api/admin/posts/${POST_ID}/unpublish" >/dev/null
GONE="$(curl -sS -o /dev/null -w '%{http_code}' "${SITE}/blog/${SLUG}")"
if [[ "${GONE}" != "404" ]]; then
  echo "Expected /blog/${SLUG} 404 after unpublish, got ${GONE}" >&2
  exit 1
fi

echo "OK: e2e:local passed"
