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

# Keep the publisher's output, which is not in dist. `dir/*` patterns become
# anchored rsync directory excludes.
EXCLUDES=()
while IFS= read -r pattern; do
  [[ -z "${pattern}" || "${pattern}" == \#* ]] && continue
  if [[ "${pattern}" == */\* ]]; then
    EXCLUDES+=(--exclude "/${pattern%\*}")
  else
    EXCLUDES+=(--exclude "/${pattern}")
  fi
done < "${ROOT}/scripts/publisher-owned-paths.generated.txt"

rsync -a --delete "${EXCLUDES[@]}" "${DIST}/" "${SITE}/"
# index.html is publisher-owned in the deploy, but locally nothing republishes
# on start and the rsync above drops the old build's assets, so the fresh shell
# replaces the prerendered home until the next Home publish.
cp "${DIST}/index.html" "${SITE}/index.html"

echo "Seeded shell into ${SITE}"
