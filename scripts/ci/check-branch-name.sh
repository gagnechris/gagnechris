#!/usr/bin/env bash
# Refuse a PR branch that doesn't carry a Linear ticket id, so Linear links the
# PR. Dependabot branches are exempt.
# Usage: scripts/ci/check-branch-name.sh <branch>
set -euo pipefail

BRANCH="${1:?branch name}"

if [[ "${BRANCH}" == dependabot/* ]]; then
  echo "Dependabot branch ${BRANCH}: no ticket id needed."
  exit 0
fi

if [[ "${BRANCH}" =~ (^|[/_-])chr-[0-9]+(-|$) ]]; then
  echo "Branch ${BRANCH} carries a ticket id."
  exit 0
fi

echo "Branch ${BRANCH} has no ticket id. Use the Linear issue's gitBranchName (e.g. gagnechris/chr-<n>-<title>)." >&2
exit 1
