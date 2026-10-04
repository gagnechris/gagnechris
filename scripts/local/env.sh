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
export DYNAMODB_LOCAL_HOST_PORT="${DYNAMODB_LOCAL_HOST_PORT:-8000}"
export AWS_ENDPOINT_URL_DYNAMODB="${AWS_ENDPOINT_URL_DYNAMODB:-http://127.0.0.1:${DYNAMODB_LOCAL_HOST_PORT}}"
# Stable Compose project so worktrees reuse one DynamoDB Local.
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-gagnechris}"

export DATA_TABLE_NAME="${DATA_TABLE_NAME:-gagnechris-local}"
if [[ "${DATA_TABLE_NAME}" == "gagnechris-prod" ]]; then
  echo "Refusing local env with DATA_TABLE_NAME=gagnechris-prod" >&2
  return 1 2>/dev/null || exit 1
fi

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
# Only accept an override under this repo; zsh/cwd can otherwise resolve to ~.
if [[ -z "${SITE_BUCKET_NAME:-}" || "${SITE_BUCKET_NAME}" != "${_LOCAL_ROOT}/"* ]]; then
  export SITE_BUCKET_NAME="${_LOCAL_ROOT}/.local-site"
fi
export CLOUDFRONT_DISTRIBUTION_ID=local
# Stands in for the CloudFront KeyValueStore: the publisher writes the slug
# allowlist here and the local static server reads it.
export LOCAL_KVS_FILE="${_LOCAL_ROOT}/.local-kvs.json"
export SITE_APEX_DOMAIN=gagnechris.com

export LOCAL_API_PORT="${LOCAL_API_PORT:-8787}"
export LOCAL_SITE_PORT="${LOCAL_SITE_PORT:-4177}"
export VITE_AUTH_MODE=local
export VITE_LOCAL_API_ORIGIN="http://127.0.0.1:${LOCAL_API_PORT}"
export VITE_LOCAL_SITE_ORIGIN="http://127.0.0.1:${LOCAL_SITE_PORT}"
