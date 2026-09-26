#!/usr/bin/env bash
# Build apps/web and sync to the prod Site bucket, then invalidate CloudFront.
# Bucket / distribution IDs come from SSM (written by Site-prod) — nothing hard-coded.
#
# Publisher-owned paths are never deleted: /blog/*, /media/*, sitemap.xml, rss.xml
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

npm run build -w @gagnechris/web

if [ ! -d "${DIST}" ]; then
  echo "Missing build output: ${DIST}" >&2
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
aws s3 sync "${DIST}/" "s3://${BUCKET}/" \
  --region "${AWS_REGION}" \
  --delete \
  --exclude "assets/*" \
  --exclude "blog/*" \
  --exclude "media/*" \
  --exclude "sitemap.xml" \
  --exclude "rss.xml" \
  --cache-control "public,max-age=0,must-revalidate" \
  --metadata-directive REPLACE

# 3) Until the publisher owns these, publish the build copies without --delete.
if [ -f "${DIST}/sitemap.xml" ]; then
  aws s3 cp "${DIST}/sitemap.xml" "s3://${BUCKET}/sitemap.xml" \
    --region "${AWS_REGION}" \
    --cache-control "public,max-age=300" \
    --content-type "application/xml" \
    --metadata-directive REPLACE
fi
if [ -f "${DIST}/rss.xml" ]; then
  aws s3 cp "${DIST}/rss.xml" "s3://${BUCKET}/rss.xml" \
    --region "${AWS_REGION}" \
    --cache-control "public,max-age=300" \
    --content-type "application/rss+xml" \
    --metadata-directive REPLACE
fi

aws cloudfront create-invalidation \
  --distribution-id "${DISTRIBUTION_ID}" \
  --paths "/*" \
  --region "${AWS_REGION}" \
  --query 'Invalidation.Id' --output text

echo "Web deploy complete."
