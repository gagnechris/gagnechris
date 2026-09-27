#!/usr/bin/env bash
# Copy apps/web production build into the local publisher site root.
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

# Preserve existing blog/ artifacts; refresh shell + assets from dist
# (includes pristine _shell.html for the publisher; CHR-104).
rsync -a --delete \
  --exclude 'blog/' \
  --exclude 'sitemap.xml' \
  --exclude 'rss.xml' \
  "${DIST}/" "${SITE}/"

echo "Seeded shell into ${SITE}"
