#!/usr/bin/env bash
# Refuse a rollback deploy. An unknown deployed SHA fails rather than
# deploying everything.
# Usage: scripts/ci/check-deploy-ancestry.sh <deployedSha> <headSha>
set -euo pipefail

BASE="${1:?deployed SHA}"
HEAD="${2:?head SHA}"

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

echo "Deploy head ${HEAD} descends from deployed ${BASE}."
