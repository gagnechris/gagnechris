#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="${ENV_NAME:-prod}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="${ROOT}/apps/web/dist"
SSM_JSON="${ROOT}/infra/lib/config/ssm-params.json"

ssm_name() {
  local key="$1"
  local leaf
  leaf="$(node -e "const j=require(process.argv[1]); const k=process.argv[2]; if(!j.keys[k]) { console.error('unknown SSM key: '+k); process.exit(1)}; process.stdout.write(j.keys[k])" "${SSM_JSON}" "${key}")"
  local prefix
  prefix="$(node -e "const j=require(process.argv[1]); process.stdout.write(j.prefixTemplate.replaceAll('\${ENV_NAME}', process.argv[2]))" "${SSM_JSON}" "${ENV_NAME}")"
  echo "${prefix}/${leaf}"
}

BUCKET="$(aws ssm get-parameter \
  --name "$(ssm_name siteBucketName)" \
  --region "${AWS_REGION}" \
  --query 'Parameter.Value' --output text)"
DISTRIBUTION_ID="$(aws ssm get-parameter \
  --name "$(ssm_name cloudfrontDistributionId)" \
  --region "${AWS_REGION}" \
  --query 'Parameter.Value' --output text)"

echo "Deploying web → s3://${BUCKET} (CloudFront ${DISTRIBUTION_ID})"

export VITE_COGNITO_USER_POOL_ID="$(aws ssm get-parameter \
  --name "$(ssm_name cognitoUserPoolId)" \
  --region "${AWS_REGION}" \
  --query 'Parameter.Value' --output text)"
export VITE_COGNITO_WEB_CLIENT_ID="$(aws ssm get-parameter \
  --name "$(ssm_name cognitoWebClientId)" \
  --region "${AWS_REGION}" \
  --query 'Parameter.Value' --output text)"
export VITE_COGNITO_AUTH_DOMAIN="$(aws ssm get-parameter \
  --name "$(ssm_name cognitoAuthDomain)" \
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

# The publisher renders from this pristine shell; index.html gets prerendered over.
if [ ! -f "${DIST}/_shell.html" ]; then
  echo "Missing build output: ${DIST}/_shell.html" >&2
  exit 1
fi

# Upload hashed assets before the HTML that references them.
if [ -d "${DIST}/assets" ]; then
  aws s3 sync "${DIST}/assets/" "s3://${BUCKET}/assets/" \
    --region "${AWS_REGION}" \
    --cache-control "public,max-age=31536000,immutable" \
    --metadata-directive REPLACE
fi

# Excludes also protect publisher-owned paths from --delete. home/* holds
# last-published.json so an unpublished Home survives deploys.
aws s3 sync "${DIST}/" "s3://${BUCKET}/" \
  --region "${AWS_REGION}" \
  --delete \
  --exclude "assets/*" \
  --exclude "blog/*" \
  --exclude "resume/*" \
  --exclude "resume.pdf" \
  --exclude "home/*" \
  --exclude "media/*" \
  --exclude "notebook/*" \
  --exclude "sitemap.xml" \
  --exclude "rss.xml" \
  --cache-control "public,max-age=0,must-revalidate" \
  --metadata-directive REPLACE

# Extensionless Apple / WebAuthn association files need application/json; S3
# guesses binary/octet-stream.
if [ -d "${DIST}/.well-known" ]; then
  while IFS= read -r -d '' well_known; do
    key=".well-known/${well_known#"${DIST}/.well-known/"}"
    echo "Uploading ${key} as application/json"
    aws s3 cp "${well_known}" "s3://${BUCKET}/${key}" \
      --region "${AWS_REGION}" \
      --content-type "application/json" \
      --cache-control "public,max-age=0,must-revalidate" \
      --metadata-directive REPLACE
  done < <(find "${DIST}/.well-known" -type f -print0)
fi

aws cloudfront create-invalidation \
  --distribution-id "${DISTRIBUTION_ID}" \
  --paths "/*" \
  --region "${AWS_REGION}" \
  --query 'Invalidation.Id' --output text

# Re-render publisher pages against the new shell. `aws lambda invoke` exits 0
# even when the function throws, so check FunctionError.
PUBLISHER_FN="$(aws ssm get-parameter \
  --name "$(ssm_name publisherFunctionName)" \
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
