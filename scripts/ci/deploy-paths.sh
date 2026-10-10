#!/usr/bin/env bash
# Plain git + bash so the credentialed plan job runs no third-party action.
# Patterns are bash `case` globs (`*` also matches `/`).
# Usage: scripts/ci/deploy-paths.sh <baseSha> <headSha>
set -euo pipefail

BASE="${1:?base SHA}"
HEAD="${2:?head SHA}"

CDK_PATTERNS=(
  'infra/*'
  'services/*'
  'go/*'
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

# Usage: matches <ignore-glob> <pattern>...  ('' ignores nothing)
matches() {
  local ignore="$1" file pattern
  shift
  while IFS= read -r file; do
    [ -z "${file}" ] && continue
    # shellcheck disable=SC2254 # ignore is intentionally a glob
    if [ -n "${ignore}" ]; then case "${file}" in ${ignore}) continue ;; esac; fi
    for pattern in "$@"; do
      # shellcheck disable=SC2254 # pattern is intentionally a glob
      case "${file}" in
        ${pattern}) return 0 ;;
      esac
    done
  done <<<"${changed}"
  return 1
}

# Markdown (e.g. infra/RUNBOOK.md) never affects synth, so it doesn't redeploy CDK.
if matches '*.md' "${CDK_PATTERNS[@]}"; then echo 'cdk=true'; else echo 'cdk=false'; fi
if matches '' "${WEB_PATTERNS[@]}"; then echo 'web=true'; else echo 'web=false'; fi
