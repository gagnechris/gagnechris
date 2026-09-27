#!/usr/bin/env bash
# Build apps/web and sync to the prod Site bucket, then invalidate CloudFront.
# Bucket / distribution IDs come from SSM (written by Site-prod) — nothing hard-coded.
#
# Publisher-owned paths are never deleted: /blog/*, /resume/*, /media/*, sitemap.xml, rss.xml
set -euo pipefail

ENV_NAME="${ENV_NAME:-prod}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="${ROOT}/apps/web/dist"

BUCKET="$(aws ssm get-parameter \
  --name "/gagnechris/${ENV_NAME}/site-bucket-name" \
  --region "${AWS_REGION}" \
  --query 'Parameter.Value' --output text)"
DISTRIBUTION_ID="$(aws ssm get-parameter \
  --name "/gagnechris/${ENV_NAME}/cloudfront-distribution-id" \
  --region "${AWS_REGION}" \
  --query 'Parameter.Value' --output text)"

echo "Deploying web → s3://${BUCKET} (CloudFront ${DISTRIBUTION_ID})"

# Bake Cognito public config into the SPA (SSM from Auth stack).
export VITE_COGNITO_USER_POOL_ID="$(aws ssm get-parameter \
  --name "/gagnechris/${ENV_NAME}/cognito-user-pool-id" \
  --region "${AWS_REGION}" \
  --query 'Parameter.Value' --output text)"
export VITE_COGNITO_WEB_CLIENT_ID="$(aws ssm get-parameter \
  --name "/gagnechris/${ENV_NAME}/cognito-web-client-id" \
  --region "${AWS_REGION}" \
  --query 'Parameter.Value' --output text)"
export VITE_COGNITO_AUTH_DOMAIN="$(aws ssm get-parameter \
  --name "/gagnechris/${ENV_NAME}/cognito-auth-domain" \
  --region "${AWS_REGION}" \
  --query 'Parameter.Value' --output text)"

npm run build -w @gagnechris/web

if [ ! -d "${DIST}" ]; then
  echo "Missing build output: ${DIST}" >&2
  exit 1
fi

if [ ! -f "${DIST}/index.html" ]; then
  echo "Missing build output: ${DIST}/index.html" >&2
  exit 1
fi

# Pristine Vite shell for the publisher (emitted by staticPagesPlugin before home
# meta is applied). Never overwritten by home prerender — see CHR-104.
if [ ! -f "${DIST}/_shell.html" ]; then
  echo "Missing build output: ${DIST}/_shell.html" >&2
  exit 1
fi

# 1) Hashed Vite assets — long cache, upload before HTML.
if [ -d "${DIST}/assets" ]; then
  aws s3 sync "${DIST}/assets/" "s3://${BUCKET}/assets/" \
    --region "${AWS_REGION}" \
    --cache-control "public,max-age=31536000,immutable" \
    --metadata-directive REPLACE
fi

# 2) Rest of the site. --delete cleans removed app files but never touches
#    Option B publisher paths (exclude applies to deletes too).
#    resume/index.html is publisher-owned once the resume is published; the
#    previously deployed meta shell stays until then (SPA renders DEFAULT_RESUME).
#    index.html is the home document (publisher may prerender into it). _shell.html
#    is the pristine template the publisher reads (CHR-104). spa.html serves /admin|/auth.
aws s3 sync "${DIST}/" "s3://${BUCKET}/" \
  --region "${AWS_REGION}" \
  --delete \
  --exclude "assets/*" \
  --exclude "blog/*" \
  --exclude "resume/*" \
  --exclude "resume.pdf" \
  --exclude "media/*" \
  --exclude "sitemap.xml" \
  --exclude "rss.xml" \
  --cache-control "public,max-age=0,must-revalidate" \
  --metadata-directive REPLACE

aws cloudfront create-invalidation \
  --distribution-id "${DISTRIBUTION_ID}" \
  --paths "/*" \
  --region "${AWS_REGION}" \
  --query 'Invalidation.Id' --output text

# 3) Re-render publisher-owned pages against the new HTML shell (CHR-34).
#    aws lambda invoke exits 0 even when the function throws — check FunctionError
#    so a failed republish-all fails CI instead of leaving an empty home shell.
PUBLISHER_FN="$(aws ssm get-parameter \
  --name "/gagnechris/${ENV_NAME}/publisher-function-name" \
  --region "${AWS_REGION}" \
  --query 'Parameter.Value' --output text 2>/dev/null || true)"
if [ -n "${PUBLISHER_FN}" ]; then
  echo "Invoking publisher republish-all (${PUBLISHER_FN})"
  OUT="$(mktemp)"
  FUNC_ERR="$(aws lambda invoke \
    --function-name "${PUBLISHER_FN}" \
    --cli-binary-format raw-in-base64-out \
    --payload '{"action":"republishAll"}' \
    --region "${AWS_REGION}" \
    --query 'FunctionError' \
    --output text \
    "${OUT}")"
  cat "${OUT}"
  rm -f "${OUT}"
  if [ -n "${FUNC_ERR}" ] && [ "${FUNC_ERR}" != "None" ]; then
    echo "Publisher republish-all failed (FunctionError=${FUNC_ERR})" >&2
    exit 1
  fi
else
  echo "Publisher function SSM param missing; skipped republish-all" >&2
fi

echo "Web deploy complete."
