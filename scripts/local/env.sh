#!/usr/bin/env bash
# Safe local AWS env: fake credentials, no profile, local endpoints only.
# Usage: source scripts/local/env.sh  (bash or zsh)

unset AWS_PROFILE
unset AWS_DEFAULT_PROFILE
export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local
export AWS_SESSION_TOKEN=
export AWS_DEFAULT_REGION=us-east-1
export AWS_REGION=us-east-1
export AWS_ENDPOINT_URL_DYNAMODB="${AWS_ENDPOINT_URL_DYNAMODB:-http://127.0.0.1:8000}"
# Stable Compose project so worktrees reuse one DynamoDB Local (CHR-117).
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-gagnechris}"

export DATA_TABLE_NAME="${DATA_TABLE_NAME:-gagnechris-local}"
if [[ "${DATA_TABLE_NAME}" == "gagnechris-prod" ]]; then
  echo "Refusing local env with DATA_TABLE_NAME=gagnechris-prod" >&2
  return 1 2>/dev/null || exit 1
fi

# Resolve repo root from this file (works when sourced from bash or zsh).
_local_env_file=""
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
  _local_env_file="${BASH_SOURCE[0]}"
elif [[ -n "${ZSH_VERSION:-}" ]]; then
  # zsh: %x is the sourced file path when this runs under `source`
  # shellcheck disable=SC2296
  _local_env_file="${(%):-%x}"
else
  _local_env_file="$0"
fi
_LOCAL_ROOT="$(cd "$(dirname "${_local_env_file}")/../.." && pwd)"
unset _local_env_file

export SITE_STORAGE=filesystem
# Always pin to the repo's .local-site unless the caller set an absolute override
# that already lives under this repo (avoids zsh/cwd resolving to ~/ .local-site).
if [[ -z "${SITE_BUCKET_NAME:-}" || "${SITE_BUCKET_NAME}" != "${_LOCAL_ROOT}/"* ]]; then
  export SITE_BUCKET_NAME="${_LOCAL_ROOT}/.local-site"
fi
export CLOUDFRONT_DISTRIBUTION_ID=local
export SITE_APEX_DOMAIN=gagnechris.com

export LOCAL_API_PORT="${LOCAL_API_PORT:-8787}"
export LOCAL_SITE_PORT="${LOCAL_SITE_PORT:-4177}"
export VITE_AUTH_MODE=local
export VITE_LOCAL_API_ORIGIN="http://127.0.0.1:${LOCAL_API_PORT}"
# Vite proxies /blog → local static origin (publisher output), matching prod CF.
export VITE_LOCAL_SITE_ORIGIN="http://127.0.0.1:${LOCAL_SITE_PORT}"
