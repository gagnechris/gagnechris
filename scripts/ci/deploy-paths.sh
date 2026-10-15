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
  'packages/*'
  'package.json'
  'package-lock.json'
  'tsconfig.base.json'
  '.nvmrc'
  '.github/workflows/cdk.yml'
  '.github/actions/setup/*'
)

# web runs deploy-web.sh: build, sync, invalidate and republishAll. Besides
# the apps it covers what the publisher renders with (so existing pages are
# re-rendered), what the site's buckets and distributions are, the Cognito
# clients and SSM names the build reads, and the sync's publisher-owned keys.
WEB_PATTERNS=(
  'apps/web/*'
  'packages/api-client/*'
  'packages/app-core/*'
  'packages/public-ui/*'
  'packages/shared/*'
  'packages/tokens/*'
  'packages/ui/*'
  'packages/data/*'
  'services/publisher/*'
  'infra/lib/stacks/publisher-stack.ts'
  'infra/lib/stacks/site-stack.ts'
  'infra/lib/stacks/auth-stack.ts'
  'infra/lib/constructs/site-hosting.ts'
  'infra/lib/constructs/app-host.ts'
  'infra/lib/cloudfront/*'
  'infra/lib/config/ssm-params.json'
  'scripts/publisher-owned-paths.generated.txt'
  'package.json'
  'package-lock.json'
  'tsconfig.base.json'
  '.nvmrc'
  'scripts/deploy-web.sh'
  'scripts/ssm-param-name.sh'
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
