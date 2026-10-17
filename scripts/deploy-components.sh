#!/usr/bin/env bash
# Builds the Storybook catalog and ships it to components.gagnechris.com.
#
#   deploy-components.sh         build, then upload
#   deploy-components.sh build   build only, with no AWS access
#   deploy-components.sh upload  upload an existing build
set -euo pipefail

MODE="${1:-all}"
case "${MODE}" in
  all | build | upload) ;;
  *)
    echo "Usage: deploy-components.sh [build|upload]" >&2
    exit 2
    ;;
esac

ENV_NAME="${ENV_NAME:-prod}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="${ROOT}/apps/storybook/storybook-static"
# shellcheck source=scripts/ssm-param-name.sh
source "${ROOT}/scripts/ssm-param-name.sh"

ssm_value() {
  local name
  name="$(ssm_param_name "${ENV_NAME}" "$1")" || return
  aws ssm get-parameter \
    --name "${name}" \
    --region "${AWS_REGION}" \
    --query 'Parameter.Value' --output text
}

if [ "${MODE}" != build ]; then
  BUCKET="$(ssm_value componentsBucketName)"
  DISTRIBUTION_ID="$(ssm_value componentsDistributionId)"
fi

if [ "${MODE}" != upload ]; then
  npm run storybook:build
fi

if [ ! -f "${DIST}/index.html" ]; then
  echo "Missing build output: ${DIST}/index.html" >&2
  exit 1
fi

if [ "${MODE}" = build ]; then
  echo "Components build complete."
  exit 0
fi

echo "Deploying components → s3://${BUCKET} (CloudFront ${DISTRIBUTION_ID})"
# Hashed assets go up before the pages that reference them and are never
# deleted, so an open catalog tab can still load the chunks it started with.
aws s3 sync "${DIST}/assets/" "s3://${BUCKET}/assets/" \
  --region "${AWS_REGION}" \
  --cache-control "public,max-age=31536000,immutable" \
  --metadata-directive REPLACE
aws s3 sync "${DIST}/" "s3://${BUCKET}/" \
  --region "${AWS_REGION}" \
  --delete \
  --exclude "assets/*" \
  --cache-control "public,max-age=0,must-revalidate" \
  --metadata-directive REPLACE

aws cloudfront create-invalidation \
  --distribution-id "${DISTRIBUTION_ID}" \
  --paths "/*" \
  --region "${AWS_REGION}" \
  --query 'Invalidation.Id' --output text

echo "Components deploy complete."
