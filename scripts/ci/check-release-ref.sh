#!/usr/bin/env bash
# Refuse a TestFlight release unless it runs from an `ios-v*` tag on a commit
# already on main.
# Usage: scripts/ci/check-release-ref.sh <ref> <sha> [main-ref]
set -euo pipefail

REF="${1:?git ref}"
SHA="${2:?commit SHA}"
MAIN="${3:-origin/main}"

if [[ "${REF}" != refs/tags/ios-v* ]]; then
  echo "Refusing release: ${REF} is not an ios-v* tag." >&2
  exit 1
fi

if ! git merge-base --is-ancestor "${SHA}" "${MAIN}"; then
  echo "Refusing release: ${SHA} is not on ${MAIN}." >&2
  exit 1
fi

echo "Releasing ${REF} (${SHA}), which is on ${MAIN}."
