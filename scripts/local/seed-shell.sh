#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=env.sh
source "${ROOT}/scripts/local/env.sh"

DIST="${ROOT}/apps/web/dist"
SITE="${SITE_BUCKET_NAME}"

if [[ ! -f "${DIST}/index.html" ]]; then
  echo "Missing ${DIST}/index.html — run: npm run build" >&2
  exit 1
fi

mkdir -p "${SITE}"
if [[ ! -f "${DIST}/_shell.html" ]]; then
  echo "Missing ${DIST}/_shell.html — run: npm run build" >&2
  exit 1
fi

# Keep publisher output (blog/, sitemap, rss) that is not in dist.
rsync -a --delete \
  --exclude 'blog/' \
  --exclude 'sitemap.xml' \
  --exclude 'rss.xml' \
  "${DIST}/" "${SITE}/"

echo "Seeded shell into ${SITE}"
