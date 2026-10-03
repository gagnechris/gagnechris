#!/usr/bin/env bash
# Decide which parts of prod to deploy from the files changed since the last
# deployed SHA (CHR-149). Prints `cdk=<bool>` and `web=<bool>` lines for
# $GITHUB_OUTPUT. Plain git + bash, so the credentialed plan job runs no
# third-party action (CHR-200). Patterns are bash `case` globs (`*` also
# matches `/`).
#
# Usage: scripts/ci/deploy-paths.sh <baseSha> <headSha>
set -euo pipefail

BASE="${1:?base SHA}"
HEAD="${2:?head SHA}"

CDK_PATTERNS=(
  'infra/*'
  'services/*'
  'packages/*'
  'package.json'
  'package-lock.json'
  'tsconfig.base.json'
  '.nvmrc'
  '.github/workflows/cdk.yml'
  '.github/actions/setup/*'
)

WEB_PATTERNS=(
  'apps/web/*'
  'packages/api-client/*'
  'packages/app-core/*'
  'packages/shared/*'
  'packages/tokens/*'
  'package.json'
  'package-lock.json'
  'tsconfig.base.json'
  '.nvmrc'
  'scripts/deploy-web.sh'
  '.github/workflows/cdk.yml'
  '.github/actions/setup/*'
)

changed="$(git diff --name-only "${BASE}" "${HEAD}")"

matches() {
  local file pattern
  while IFS= read -r file; do
    [ -z "${file}" ] && continue
    for pattern in "$@"; do
      # shellcheck disable=SC2254 # pattern is intentionally a glob
      case "${file}" in
        ${pattern}) return 0 ;;
      esac
    done
  done <<<"${changed}"
  return 1
}

if matches "${CDK_PATTERNS[@]}"; then echo 'cdk=true'; else echo 'cdk=false'; fi
if matches "${WEB_PATTERNS[@]}"; then echo 'web=true'; else echo 'web=false'; fi
