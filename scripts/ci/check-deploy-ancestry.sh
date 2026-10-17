#!/usr/bin/env bash
# Refuse a deploy whose head is not on main, and a rollback deploy. An unknown
# deployed SHA fails rather than deploying everything; an empty one (first
# deploy) skips the rollback check.
# Usage: scripts/ci/check-deploy-ancestry.sh <deployedSha|''> <headSha> [main-ref]
set -euo pipefail

BASE="${1-}"
HEAD="${2:?head SHA}"
MAIN="${3:-origin/main}"

if ! git merge-base --is-ancestor "${HEAD}" "${MAIN}"; then
  echo "Refusing deploy: ${HEAD} is not on ${MAIN}." >&2
  exit 1
fi

if [ -z "${BASE}" ]; then
  echo "Deploy head ${HEAD} is on ${MAIN}; no deployed-sha yet."
  exit 0
fi

if ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  echo "deployed-sha ${BASE} not in this clone; fetching it from origin."
  git fetch --no-tags --quiet origin "${BASE}" || true
fi

if ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  echo "Refusing deploy: deployed-sha ${BASE} is not in the repository, so the rollback check cannot run." >&2
  exit 1
fi

if ! git merge-base --is-ancestor "${BASE}" "${HEAD}"; then
  echo "Refusing deploy: ${HEAD} is not a descendant of deployed ${BASE}." >&2
  exit 1
fi

echo "Deploy head ${HEAD} is on ${MAIN} and descends from deployed ${BASE}."
