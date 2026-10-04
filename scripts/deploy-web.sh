#!/usr/bin/env bash
# Builds the public, admin and Notebook apps and ships each to its own bucket
# and CloudFront distribution.
set -euo pipefail

ENV_NAME="${ENV_NAME:-prod}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="${ROOT}/apps/web"
DIST="${WEB}/dist"
SSM_JSON="${ROOT}/infra/lib/config/ssm-params.json"

ssm_name() {
  local key="$1"
  local leaf
  leaf="$(node -e "const j=require(process.argv[1]); const k=process.argv[2]; if(!j.keys[k]) { console.error('unknown SSM key: '+k); process.exit(1)}; process.stdout.write(j.keys[k])" "${SSM_JSON}" "${key}")"
  local prefix
  prefix="$(node -e "const j=require(process.argv[1]); process.stdout.write(j.prefixTemplate.replaceAll('\${ENV_NAME}', process.argv[2]))" "${SSM_JSON}" "${ENV_NAME}")"
  echo "${prefix}/${leaf}"
}

ssm_value() {
  aws ssm get-parameter \
    --name "$(ssm_name "$1")" \
    --region "${AWS_REGION}" \
    --query 'Parameter.Value' --output text
}

BUCKET="$(ssm_value siteBucketName)"
DISTRIBUTION_ID="$(ssm_value cloudfrontDistributionId)"
ADMIN_BUCKET="$(ssm_value adminSiteBucketName)"
ADMIN_DISTRIBUTION_ID="$(ssm_value adminDistributionId)"
NOTEBOOK_BUCKET="$(ssm_value notebookSiteBucketName)"
NOTEBOOK_DISTRIBUTION_ID="$(ssm_value notebookDistributionId)"

VITE_COGNITO_USER_POOL_ID="$(ssm_value cognitoUserPoolId)"
VITE_COGNITO_ADMIN_CLIENT_ID="$(ssm_value cognitoAdminWebClientId)"
VITE_COGNITO_NOTEBOOK_CLIENT_ID="$(ssm_value cognitoNotebookWebClientId)"
VITE_COGNITO_AUTH_DOMAIN="$(ssm_value cognitoAuthDomain)"
export VITE_COGNITO_USER_POOL_ID VITE_COGNITO_ADMIN_CLIENT_ID \
  VITE_COGNITO_NOTEBOOK_CLIENT_ID VITE_COGNITO_AUTH_DOMAIN

npm run build -w @gagnechris/web
npm run --silent check:web-shells

# The publisher renders from this pristine shell; index.html gets prerendered over.
for required in index.html _shell.html; do
  if [ ! -f "${DIST}/${required}" ]; then
    echo "Missing build output: ${DIST}/${required}" >&2
    exit 1
  fi
done

# Extensionless Apple / WebAuthn association files need application/json; S3
# guesses binary/octet-stream.
upload_well_known() {
  local dir="$1" bucket="$2"
  [ -d "${dir}/.well-known" ] || return 0
  while IFS= read -r -d '' well_known; do
    local key=".well-known/${well_known#"${dir}/.well-known/"}"
    echo "Uploading ${key} as application/json"
    aws s3 cp "${well_known}" "s3://${bucket}/${key}" \
      --region "${AWS_REGION}" \
      --content-type "application/json" \
      --cache-control "public,max-age=0,must-revalidate" \
      --metadata-directive REPLACE
  done < <(find "${dir}/.well-known" -type f -print0)
}

# Hashed assets go up before the HTML that references them and are never
# deleted: an open tab or installed PWA still lazy-loads chunks from the build
# it started with.
upload_assets() {
  local dir="$1" bucket="$2"
  [ -d "${dir}/assets" ] || return 0
  aws s3 sync "${dir}/assets/" "s3://${bucket}/assets/" \
    --region "${AWS_REGION}" \
    --cache-control "public,max-age=31536000,immutable" \
    --metadata-directive REPLACE
}

# Font file names carry a content hash (check:web-shells verifies it), so they
# cache like hashed assets and old versions are never deleted.
upload_fonts() {
  local dir="$1" bucket="$2"
  [ -d "${dir}/fonts" ] || return 0
  aws s3 sync "${dir}/fonts/" "s3://${bucket}/fonts/" \
    --region "${AWS_REGION}" \
    --exclude "*" \
    --include "*.woff2" \
    --cache-control "public,max-age=31536000,immutable" \
    --metadata-directive REPLACE
}

invalidate() {
  aws cloudfront create-invalidation \
    --distribution-id "$1" \
    --paths "/*" \
    --region "${AWS_REGION}" \
    --query 'Invalidation.Id' --output text
}

deploy_app() {
  local label="$1" dir="$2" bucket="$3" distribution_id="$4"
  echo "Deploying ${label} → s3://${bucket} (CloudFront ${distribution_id})"
  if [ ! -f "${dir}/index.html" ]; then
    echo "Missing build output: ${dir}/index.html" >&2
    exit 1
  fi
  upload_assets "${dir}" "${bucket}"
  aws s3 sync "${dir}/" "s3://${bucket}/" \
    --region "${AWS_REGION}" \
    --delete \
    --exclude "assets/*" \
    --cache-control "public,max-age=0,must-revalidate" \
    --metadata-directive REPLACE
  upload_well_known "${dir}" "${bucket}"
  if [ -f "${dir}/manifest.json" ]; then
    aws s3 cp "${dir}/manifest.json" "s3://${bucket}/manifest.json" \
      --region "${AWS_REGION}" \
      --content-type "application/manifest+json" \
      --cache-control "public,max-age=0,must-revalidate" \
      --metadata-directive REPLACE
  fi
  invalidate "${distribution_id}"
}

deploy_app admin "${WEB}/dist-admin" "${ADMIN_BUCKET}" "${ADMIN_DISTRIBUTION_ID}"
deploy_app notebook "${WEB}/dist-notebook" "${NOTEBOOK_BUCKET}" "${NOTEBOOK_DISTRIBUTION_ID}"

echo "Deploying public → s3://${BUCKET} (CloudFront ${DISTRIBUTION_ID})"
upload_assets "${DIST}" "${BUCKET}"
upload_fonts "${DIST}" "${BUCKET}"

# Excludes protect publisher-owned paths from --delete. home/* holds
# last-published.json so an unpublished Home survives deploys. Anything else
# the public build doesn't produce is deleted. .vite/ is the build manifest
# check:web-shells reads; it is not part of the site.
aws s3 sync "${DIST}/" "s3://${BUCKET}/" \
  --region "${AWS_REGION}" \
  --delete \
  --exclude ".vite/*" \
  --exclude "assets/*" \
  --exclude "fonts/*.woff2" \
  --exclude "blog/*" \
  --exclude "projects/*" \
  --exclude "resume/*" \
  --exclude "resume.pdf" \
  --exclude "home/*" \
  --exclude "media/*" \
  --exclude "notebook/*" \
  --exclude "sitemap.xml" \
  --exclude "rss.xml" \
  --cache-control "public,max-age=0,must-revalidate" \
  --metadata-directive REPLACE

upload_well_known "${DIST}" "${BUCKET}"
invalidate "${DISTRIBUTION_ID}"

# Re-render publisher pages against the new shell. `aws lambda invoke` exits 0
# even when the function throws, so check FunctionError.
PUBLISHER_FN="$(ssm_value publisherFunctionName 2>/dev/null || true)"
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
