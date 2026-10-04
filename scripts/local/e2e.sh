#!/usr/bin/env bash
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

DDB_PORT="${DYNAMODB_LOCAL_HOST_PORT:-8000}"
DDB_ENDPOINT="http://127.0.0.1:${DDB_PORT}"

echo "==> DynamoDB Local (host port ${DDB_PORT})"
docker compose -f docker-compose.local.yml up -d

echo "==> Wait for DynamoDB Local"
for i in $(seq 1 60); do
  if AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local \
    AWS_REGION=us-east-1 AWS_ENDPOINT_URL_DYNAMODB="${DDB_ENDPOINT}" \
    node -e "
      import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
      const c = new DynamoDBClient({
        region: 'us-east-1',
        endpoint: process.env.AWS_ENDPOINT_URL_DYNAMODB,
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      });
      await c.send(new ListTablesCommand({}));
    " 2>/dev/null; then
    break
  fi
  sleep 0.5
  if [[ "$i" -eq 60 ]]; then
    echo "DynamoDB Local did not become ready on :${DDB_PORT}" >&2
    exit 1
  fi
done

echo "==> Bootstrap table ${DATA_TABLE_NAME}"
npx --yes tsx scripts/local/bootstrap-table.ts

echo "==> Build web shell (if needed)"
if [[ ! -f apps/web/dist/index.html ]]; then
  VITE_COGNITO_USER_POOL_ID="${VITE_COGNITO_USER_POOL_ID:-us-east-1_ciPlaceholder}" \
  VITE_COGNITO_ADMIN_CLIENT_ID="${VITE_COGNITO_ADMIN_CLIENT_ID:-ciplaceholderadminclient000000}" \
  VITE_COGNITO_NOTEBOOK_CLIENT_ID="${VITE_COGNITO_NOTEBOOK_CLIENT_ID:-ciplaceholdernotebookclient000}" \
  VITE_COGNITO_AUTH_DOMAIN="${VITE_COGNITO_AUTH_DOMAIN:-auth.example.com}" \
  env -u VITE_AUTH_MODE npm run build
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
VERSION="$(node -e "console.log(JSON.parse(process.argv[1]).version)" "${CREATE}")"

PUBLISH="$(curl -sS -X POST "${API}/api/admin/posts/${POST_ID}/publish" \
  -H 'Content-Type: application/json' \
  -d "{\"version\":${VERSION}}")"
node -e "const p=JSON.parse(process.argv[1]); if(p.status!=='published'){console.error(p);process.exit(1)}" "${PUBLISH}"

echo "==> Assert prerendered HTML + OG"
HTML="$(curl -sS "${SITE}/posts/${SLUG}")"
echo "${HTML}" | grep -q 'Local E2E Post'
echo "${HTML}" | grep -q 'property="og:title"'
echo "${HTML}" | grep -q 'class="blog-post-prerender"'
echo "${HTML}" | grep -q 'Local body'

echo "==> / lists the new post under Recent posts (Home not published yet)"
ROOT_HTML="$(curl -sS "${SITE}/")"
echo "${ROOT_HTML}" | grep -q "href=\"/posts/${SLUG}\">Local E2E Post</a>"

echo "==> Legacy /blog URL 301s to /posts"
LEGACY_LOCATION="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' "${SITE}/blog/${SLUG}")"
if [[ "${LEGACY_LOCATION}" != "301 ${SITE}/posts/${SLUG}" ]]; then
  echo "Expected 301 to /posts/${SLUG}, got ${LEGACY_LOCATION}" >&2
  exit 1
fi

echo "==> Seed home as draft, publish, assert prerender"
HOME_JSON="$(curl -sS "${API}/api/admin/home")"
node -e "const h=JSON.parse(process.argv[1]); if(h.status!=='draft'){console.error('expected draft seed',h);process.exit(1)}" "${HOME_JSON}"
HOME_VERSION="$(node -e "console.log(JSON.parse(process.argv[1]).version)" "${HOME_JSON}")"
HOME_PUB="$(curl -sS -X POST "${API}/api/admin/home/publish" \
  -H 'Content-Type: application/json' \
  -d "{\"version\":${HOME_VERSION}}")"
node -e "const h=JSON.parse(process.argv[1]); if(h.status!=='published'||h.hasUnpublishedChanges){console.error(h);process.exit(1)}" "${HOME_PUB}"
HOME_HTML="$(curl -sS "${SITE}/")"
echo "${HOME_HTML}" | grep -q 'home-page-prerender'
echo "${HOME_HTML}" | grep -q 'class="home-hero__links"'
echo "${HOME_HTML}" | grep -q "href=\"/posts/${SLUG}\">Local E2E Post</a>"
echo "${HOME_HTML}" | grep -q '<script type="module"'

echo "==> Home prerender must not leak into other pages"
POST_HTML="$(curl -sS "${SITE}/posts/${SLUG}")"
if echo "${POST_HTML}" | grep -q 'home-page-prerender'; then
  echo "Home prerender leaked into /posts/${SLUG}" >&2
  exit 1
fi
echo "${POST_HTML}" | grep -q 'class="blog-post-prerender"'

echo "==> Edit published title without re-publish (live must stay unchanged)"
VERSION="$(node -e "console.log(JSON.parse(process.argv[1]).version)" "${PUBLISH}")"
UPDATED="$(curl -sS -X PUT "${API}/api/admin/posts/${POST_ID}" \
  -H 'Content-Type: application/json' \
  -d "{\"version\":${VERSION},\"title\":\"Local E2E Updated\"}")"
node -e "const p=JSON.parse(process.argv[1]); if(p.title!=='Local E2E Updated'||!p.hasUnpublishedChanges){console.error(p);process.exit(1)}" "${UPDATED}"

HTML2="$(curl -sS "${SITE}/posts/${SLUG}")"
echo "${HTML2}" | grep -q 'Local E2E Post'
if echo "${HTML2}" | grep -q 'Local E2E Updated'; then
  echo "Draft edit unexpectedly went live before publish" >&2
  exit 1
fi

echo "==> Publish changes makes the edit live"
VERSION="$(node -e "console.log(JSON.parse(process.argv[1]).version)" "${UPDATED}")"
REPUBLISH="$(curl -sS -X POST "${API}/api/admin/posts/${POST_ID}/publish" \
  -H 'Content-Type: application/json' \
  -d "{\"version\":${VERSION}}")"
node -e "const p=JSON.parse(process.argv[1]); if(p.title!=='Local E2E Updated'||p.hasUnpublishedChanges){console.error(p);process.exit(1)}" "${REPUBLISH}"
HTML3="$(curl -sS "${SITE}/posts/${SLUG}")"
echo "${HTML3}" | grep -q 'Local E2E Updated'
ROOT_HTML="$(curl -sS "${SITE}/")"
echo "${ROOT_HTML}" | grep -q "href=\"/posts/${SLUG}\">Local E2E Updated</a>"

echo "==> Orphan cleanup"
ORPHAN_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "${SITE}/posts/orphan-e2e")"
if [[ "${ORPHAN_CODE}" != "404" ]]; then
  echo "Expected orphan-e2e to be removed (404), got ${ORPHAN_CODE}" >&2
  exit 1
fi

echo "==> Unpublish removes prerender"
VERSION="$(node -e "console.log(JSON.parse(process.argv[1]).version)" "${REPUBLISH}")"
curl -sS -X POST "${API}/api/admin/posts/${POST_ID}/unpublish" \
  -H 'Content-Type: application/json' \
  -d "{\"version\":${VERSION}}" >/dev/null
GONE="$(curl -sS -o /dev/null -w '%{http_code}' "${SITE}/posts/${SLUG}")"
if [[ "${GONE}" != "404" ]]; then
  echo "Expected /posts/${SLUG} 404 after unpublish, got ${GONE}" >&2
  exit 1
fi
ROOT_HTML="$(curl -sS "${SITE}/")"
if echo "${ROOT_HTML}" | grep -q "/posts/${SLUG}"; then
  echo "Unpublished post still listed on /" >&2
  exit 1
fi

echo "==> Create + publish project ${SLUG}"
PROJECT="$(curl -sS -X POST "${API}/api/admin/projects" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Local E2E Project ${SLUG}\",\"slug\":\"${SLUG}\",\"stage\":\"building\",\"pitch\":\"Local pitch\",\"bodyMarkdown\":\"## Why I built it\\n\\nLocal project body.\"}")"
PROJECT_ID="$(node -e "const p=JSON.parse(process.argv[1]); if(!p.id){console.error(p);process.exit(1)}; console.log(p.id)" "${PROJECT}")"
PROJECT_VERSION="$(node -e "console.log(JSON.parse(process.argv[1]).version)" "${PROJECT}")"
PROJECT_PUB="$(curl -sS -X POST "${API}/api/admin/projects/${PROJECT_ID}/publish" \
  -H 'Content-Type: application/json' \
  -d "{\"version\":${PROJECT_VERSION}}")"
node -e "const p=JSON.parse(process.argv[1]); if(p.status!=='published'){console.error(p);process.exit(1)}" "${PROJECT_PUB}"

echo "==> Publish an idea with no body (listed, no page)"
IDEA="$(curl -sS -X POST "${API}/api/admin/projects" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Local E2E Idea ${SLUG}\",\"slug\":\"${SLUG}-idea\",\"stage\":\"idea\"}")"
IDEA_ID="$(node -e "console.log(JSON.parse(process.argv[1]).id)" "${IDEA}")"
IDEA_VERSION="$(node -e "console.log(JSON.parse(process.argv[1]).version)" "${IDEA}")"
curl -sS -X POST "${API}/api/admin/projects/${IDEA_ID}/publish" \
  -H 'Content-Type: application/json' \
  -d "{\"version\":${IDEA_VERSION}}" >/dev/null

echo "==> /projects/<slug> is live; /projects lists both; sitemap lists the page only"
PROJECT_HTML="$(curl -sS "${SITE}/projects/${SLUG}")"
echo "${PROJECT_HTML}" | grep -q "<h1>Local E2E Project ${SLUG}</h1>"
echo "${PROJECT_HTML}" | grep -q 'Local project body'
echo "${PROJECT_HTML}" | grep -q 'class="site-header"'
PROJECTS_HTML="$(curl -sS "${SITE}/projects")"
echo "${PROJECTS_HTML}" | grep -q "href=\"/projects/${SLUG}\">Local E2E Project ${SLUG}</a>"
echo "${PROJECTS_HTML}" | grep -q "<h2 class=\"project-name\">Local E2E Idea ${SLUG}</h2>"
IDEA_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "${SITE}/projects/${SLUG}-idea")"
if [[ "${IDEA_CODE}" != "404" ]]; then
  echo "Expected the idea to have no page (404), got ${IDEA_CODE}" >&2
  exit 1
fi
SITEMAP="$(curl -sS "${SITE}/sitemap.xml")"
echo "${SITEMAP}" | grep -q "/projects/${SLUG}</loc>"
if echo "${SITEMAP}" | grep -q "/projects/${SLUG}-idea<"; then
  echo "Idea with no body is in sitemap.xml" >&2
  exit 1
fi

echo "==> Unpublish removes the project page, its /projects entry and its sitemap entry"
PROJECT_VERSION="$(node -e "console.log(JSON.parse(process.argv[1]).version)" "${PROJECT_PUB}")"
curl -sS -X POST "${API}/api/admin/projects/${PROJECT_ID}/unpublish" \
  -H 'Content-Type: application/json' \
  -d "{\"version\":${PROJECT_VERSION}}" >/dev/null
GONE_PROJECT="$(curl -sS -o /dev/null -w '%{http_code}' "${SITE}/projects/${SLUG}")"
if [[ "${GONE_PROJECT}" != "404" ]]; then
  echo "Expected /projects/${SLUG} 404 after unpublish, got ${GONE_PROJECT}" >&2
  exit 1
fi
if curl -sS "${SITE}/projects" | grep -q "Local E2E Project ${SLUG}"; then
  echo "Unpublished project still listed on /projects" >&2
  exit 1
fi
if curl -sS "${SITE}/sitemap.xml" | grep -q "/projects/${SLUG}<"; then
  echo "Unpublished project still in sitemap.xml" >&2
  exit 1
fi

echo "==> /projects/does-not-exist is the HTML 404"
MISSING_BODY="$(mktemp)"
MISSING_HEADERS="$(curl -sS -D - -o "${MISSING_BODY}" "${SITE}/projects/does-not-exist")"
echo "${MISSING_HEADERS}" | head -1 | grep -q ' 404'
echo "${MISSING_HEADERS}" | grep -qi '^content-type: text/html'
grep -q 'Page not found' "${MISSING_BODY}"
rm -f "${MISSING_BODY}"

echo "OK: e2e:local passed"
