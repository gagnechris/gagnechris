#!/usr/bin/env bash
# Safe local AWS env: fake credentials, no profile, local endpoints only.
# Usage: source scripts/local/env.sh

unset AWS_PROFILE
unset AWS_DEFAULT_PROFILE
export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local
export AWS_SESSION_TOKEN=
export AWS_DEFAULT_REGION=us-east-1
export AWS_REGION=us-east-1
export AWS_ENDPOINT_URL_DYNAMODB="${AWS_ENDPOINT_URL_DYNAMODB:-http://127.0.0.1:8000}"

export DATA_TABLE_NAME="${DATA_TABLE_NAME:-gagnechris-local}"
if [[ "${DATA_TABLE_NAME}" == "gagnechris-prod" ]]; then
  echo "Refusing local env with DATA_TABLE_NAME=gagnechris-prod" >&2
  return 1 2>/dev/null || exit 1
fi

export SITE_STORAGE=filesystem
# SITE_BUCKET_NAME is the local site root when SITE_STORAGE=filesystem
export SITE_BUCKET_NAME="${SITE_BUCKET_NAME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.local-site}"
export CLOUDFRONT_DISTRIBUTION_ID=local
export SITE_APEX_DOMAIN=gagnechris.com

export LOCAL_API_PORT="${LOCAL_API_PORT:-8787}"
export LOCAL_SITE_PORT="${LOCAL_SITE_PORT:-4177}"
export VITE_AUTH_MODE=local
export VITE_LOCAL_API_ORIGIN="http://127.0.0.1:${LOCAL_API_PORT}"
