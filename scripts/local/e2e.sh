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
PROBE_PID=""
cleanup() {
  if [[ -n "${PROBE_PID}" ]] && kill -0 "${PROBE_PID}" 2>/dev/null; then
    kill "${PROBE_PID}" 2>/dev/null || true
  fi
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

# env.sh sets VITE_LOCAL_SITE_ORIGIN for the Vite dev proxy; a build that baked
# /__site in would 404 every client-side page fetch on this static site.
if grep -rqs '/__site' "${SITE_BUCKET_NAME}/assets/"; then
  echo "The built app fetches /__site, which only the Vite dev server proxies" >&2
  exit 1
fi

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

# The styled 404 the way CloudFront serves it: status 404, HTML, the page.
expect_html_404() {
  local path="$1"
  local body headers
  body="$(mktemp)"
  headers="$(curl -sS -D - -o "${body}" "${SITE}${path}")"
  if ! echo "${headers}" | head -1 | grep -q ' 404' ||
    ! echo "${headers}" | grep -qi '^content-type: text/html' ||
    ! grep -q 'Page not found' "${body}"; then
    echo "Expected ${path} to be the HTML 404, got:" >&2
    echo "${headers}" >&2
    head -c 300 "${body}" >&2
    rm -f "${body}"
    exit 1
  fi
  rm -f "${body}"
}

expect_200() {
  local path="$1"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' "${SITE}${path}")"
  if [[ "${code}" != "200" ]]; then
    echo "Expected ${path} 200, got ${code}" >&2
    exit 1
  fi
}

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

echo "==> /projects/<slug> is live; /projects lists both; Home lists the project; sitemap lists the page only"
PROJECT_HTML="$(curl -sS "${SITE}/projects/${SLUG}")"
echo "${PROJECT_HTML}" | grep -q "<h1>Local E2E Project ${SLUG}</h1>"
echo "${PROJECT_HTML}" | grep -q 'Local project body'
echo "${PROJECT_HTML}" | grep -q 'class="site-header"'
PROJECTS_HTML="$(curl -sS "${SITE}/projects")"
echo "${PROJECTS_HTML}" | grep -q "<a class=\"project-card__link\" href=\"/projects/${SLUG}\">"
echo "${PROJECTS_HTML}" | grep -q "<h2 class=\"project-card__name\">Local E2E Project ${SLUG}</h2>"
echo "${PROJECTS_HTML}" | grep -q "<h2 class=\"project-card__name\">Local E2E Idea ${SLUG}</h2>"
HOME_HTML="$(curl -sS "${SITE}/")"
echo "${HOME_HTML}" | grep -q "<h3 class=\"project-card__name\">Local E2E Project ${SLUG}</h3>"
if echo "${HOME_HTML}" | grep -q "Local E2E Idea ${SLUG}"; then
  echo "An idea is listed on Home" >&2
  exit 1
fi
expect_html_404 "/projects/${SLUG}-idea"
SITEMAP="$(curl -sS "${SITE}/sitemap.xml")"
echo "${SITEMAP}" | grep -q "/projects/${SLUG}</loc>"
if echo "${SITEMAP}" | grep -q "/projects/${SLUG}-idea<"; then
  echo "Idea with no body is in sitemap.xml" >&2
  exit 1
fi

echo "==> An unknown project id is a 400"
UNKNOWN_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${API}/api/admin/posts" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Untagged","projectIds":["01NOSUCHPROJECT0000000000"]}')"
if [[ "${UNKNOWN_CODE}" != "400" ]]; then
  echo "Expected 400 for an unknown project id, got ${UNKNOWN_CODE}" >&2
  exit 1
fi

echo "==> A tagged post is in the project's Build log and shows Part of"
TAGGED="$(curl -sS -X POST "${API}/api/admin/posts" \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"Local E2E Build Log\",\"slug\":\"${SLUG}-log\",\"bodyMarkdown\":\"Tagged.\",\"projectIds\":[\"${PROJECT_ID}\"]}")"
TAGGED_ID="$(node -e "const p=JSON.parse(process.argv[1]); if(!p.id){console.error(p);process.exit(1)}; console.log(p.id)" "${TAGGED}")"
TAGGED_VERSION="$(node -e "console.log(JSON.parse(process.argv[1]).version)" "${TAGGED}")"
curl -sS -X POST "${API}/api/admin/posts/${TAGGED_ID}/publish" \
  -H 'Content-Type: application/json' \
  -d "{\"version\":${TAGGED_VERSION}}" >/dev/null
curl -sS "${SITE}/projects/${SLUG}" | grep -q "<a class=\"project-build-log__link\" href=\"/posts/${SLUG}-log\"><h3 class=\"project-build-log__title\">Local E2E Build Log</h3>"
curl -sS "${SITE}/posts/${SLUG}-log" | grep -q "<p class=\"post-part-of\">Part of the <a class=\"post-part-of__project\" href=\"/projects/${SLUG}\">Local E2E Project ${SLUG}</a> project</p>"

echo "==> Renaming the project slug keeps the Build log and Part of"
PROJECT_SLUG="${SLUG}-renamed"
PROJECT_VERSION="$(node -e "console.log(JSON.parse(process.argv[1]).version)" "${PROJECT_PUB}")"
RENAMED="$(curl -sS -X PUT "${API}/api/admin/projects/${PROJECT_ID}" \
  -H 'Content-Type: application/json' \
  -d "{\"version\":${PROJECT_VERSION},\"slug\":\"${PROJECT_SLUG}\"}")"
PROJECT_VERSION="$(node -e "const p=JSON.parse(process.argv[1]); if(!p.version){console.error(p);process.exit(1)}; console.log(p.version)" "${RENAMED}")"
PROJECT_PUB="$(curl -sS -X POST "${API}/api/admin/projects/${PROJECT_ID}/publish" \
  -H 'Content-Type: application/json' \
  -d "{\"version\":${PROJECT_VERSION}}")"
curl -sS "${SITE}/projects/${PROJECT_SLUG}" | grep -q "<a class=\"project-build-log__link\" href=\"/posts/${SLUG}-log\"><h3 class=\"project-build-log__title\">Local E2E Build Log</h3>"
curl -sS "${SITE}/posts/${SLUG}-log" | grep -q "href=\"/projects/${PROJECT_SLUG}\">Local E2E Project ${SLUG}</a>"

echo "==> Unpublish removes the project page, its /projects and Home entries and its sitemap entry"
PROJECT_VERSION="$(node -e "console.log(JSON.parse(process.argv[1]).version)" "${PROJECT_PUB}")"
curl -sS -X POST "${API}/api/admin/projects/${PROJECT_ID}/unpublish" \
  -H 'Content-Type: application/json' \
  -d "{\"version\":${PROJECT_VERSION}}" >/dev/null
expect_html_404 "/projects/${PROJECT_SLUG}"
expect_html_404 "/projects/${SLUG}"
if curl -sS "${SITE}/projects" | grep -q "Local E2E Project ${SLUG}"; then
  echo "Unpublished project still listed on /projects" >&2
  exit 1
fi
if curl -sS "${SITE}/" | grep -q "Local E2E Project ${SLUG}"; then
  echo "Unpublished project still listed on /" >&2
  exit 1
fi
if curl -sS "${SITE}/sitemap.xml" | grep -q "/projects/${PROJECT_SLUG}<"; then
  echo "Unpublished project still in sitemap.xml" >&2
  exit 1
fi
if curl -sS "${SITE}/posts/${SLUG}-log" | grep -q 'post-part-of'; then
  echo "Post still shows Part of an unpublished project" >&2
  exit 1
fi

echo "==> Unknown page URLs are the HTML 404; real pages are 200"
for path in \
  /projects/does-not-exist /projects/x /resume/x /contact/x \
  /dont-feed-the-bears/x /dont-feed-the-bears/camp/x /x.html /resume/x.html \
  /posts/x "/posts/${SLUG}" /nope; do
  expect_html_404 "${path}"
done
for path in \
  / /posts /posts/ /resume /resume/ /contact /contact/ \
  /dont-feed-the-bears /dont-feed-the-bears/ /dont-feed-the-bears/camp/ \
  /dont-feed-the-bears/wild/ /projects /projects/ /sitemap.xml /rss.xml \
  /posts/posts.json; do
  expect_200 "${path}"
done

echo "==> The local site, like CloudFront, skips viewer-response on an origin 4xx"
PROBE_ROOT="$(mktemp -d)"
mkdir -p "${PROBE_ROOT}/infra/lib/cloudfront"
cp infra/lib/cloudfront/viewer-request-function.js "${PROBE_ROOT}/infra/lib/cloudfront/"
cat >"${PROBE_ROOT}/infra/lib/cloudfront/viewer-response-function.js" <<'JS'
function handler(event) {
  event.response.headers['x-viewer-response'] = { value: 'ran' };
  return event.response;
}
JS
PROBE_PORT="$(node -e "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")"
REPO_ROOT="${PROBE_ROOT}" LOCAL_SITE_PORT="${PROBE_PORT}" \
  npx --yes tsx services/api/local/static-server.ts &
PROBE_PID=$!
PROBE="http://127.0.0.1:${PROBE_PORT}"
wait_http "${PROBE}/" "probe site"
if ! curl -sS -D - -o /dev/null "${PROBE}/" | grep -qi '^x-viewer-response: ran'; then
  echo "viewer-response did not run on a 200" >&2
  exit 1
fi
MISSING="$(curl -sS -D - -o /dev/null "${PROBE}/assets/no-such-file-e2e.js")"
echo "${MISSING}" | head -1 | grep -q ' 404'
if echo "${MISSING}" | grep -qi '^x-viewer-response'; then
  echo "The local site ran viewer-response on an origin 404; CloudFront never does" >&2
  exit 1
fi
kill "${PROBE_PID}" 2>/dev/null || true
rm -rf "${PROBE_ROOT}"

echo "OK: e2e:local passed"
