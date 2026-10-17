#!/usr/bin/env bash
# Builds the public, admin and Notebook apps and ships each to its own bucket
# and CloudFront distribution.
#
#   deploy-web.sh              build, then upload
#   deploy-web.sh cognito-env  print the Cognito settings the build bakes in,
#                              as VAR=value lines
#   deploy-web.sh build        build only, with no AWS access when the
#                              VITE_COGNITO_* variables are set
#   deploy-web.sh upload       upload an existing build; the VITE_COGNITO_*
#                              variables it was built with must still match SSM
set -euo pipefail

MODE="${1:-all}"
case "${MODE}" in
  all | cognito-env | build | upload) ;;
  *)
    echo "Usage: deploy-web.sh [cognito-env|build|upload]" >&2
    exit 2
    ;;
esac

ENV_NAME="${ENV_NAME:-prod}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="${ROOT}/apps/web"
DIST="${WEB}/dist"
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

# Build variable and the SSM key it comes from.
COGNITO_SETTINGS=(
  VITE_COGNITO_USER_POOL_ID=cognitoUserPoolId
  VITE_COGNITO_ADMIN_CLIENT_ID=cognitoAdminWebClientId
  VITE_COGNITO_NOTEBOOK_CLIENT_ID=cognitoNotebookWebClientId
  VITE_COGNITO_AUTH_DOMAIN=cognitoAuthDomain
)

if [ "${MODE}" = cognito-env ]; then
  for setting in "${COGNITO_SETTINGS[@]}"; do
    value="$(ssm_value "${setting#*=}")"
    echo "${setting%%=*}=${value}"
  done
  exit 0
fi

if [ "${MODE}" != build ]; then
  BUCKET="$(ssm_value siteBucketName)"
  DISTRIBUTION_ID="$(ssm_value cloudfrontDistributionId)"
  ADMIN_BUCKET="$(ssm_value adminSiteBucketName)"
  ADMIN_DISTRIBUTION_ID="$(ssm_value adminDistributionId)"
  NOTEBOOK_BUCKET="$(ssm_value notebookSiteBucketName)"
  NOTEBOOK_DISTRIBUTION_ID="$(ssm_value notebookDistributionId)"
  PUBLISHER_FN="$(ssm_value publisherFunctionName)"
fi

# A CDK deploy between the build and the upload can replace a Cognito client.
if [ "${MODE}" = upload ]; then
  for setting in "${COGNITO_SETTINGS[@]}"; do
    var="${setting%%=*}"
    current="$(ssm_value "${setting#*=}")"
    if [ -z "${!var:-}" ]; then
      echo "upload needs ${var}, the value the build used" >&2
      exit 1
    fi
    if [ "${!var}" != "${current}" ]; then
      echo "${var} changed since the build (built with '${!var}', SSM has '${current}'). Re-run all jobs so the build uses it." >&2
      exit 1
    fi
  done
fi

if [ "${MODE}" != upload ]; then
  for setting in "${COGNITO_SETTINGS[@]}"; do
    var="${setting%%=*}"
    if [ -z "${!var:-}" ]; then
      value="$(ssm_value "${setting#*=}")"
      printf -v "${var}" '%s' "${value}"
    fi
    export "${var?}"
  done
  # The admin app links public pages (View live, previews) at this origin.
  VITE_PUBLIC_SITE_ORIGIN="https://gagnechris.com"
  # Production GA4 property. Only this build sets it, so local, preview and e2e
  # builds load no Google Analytics.
  GA_MEASUREMENT_ID="G-CDG30T24XY"
  export VITE_PUBLIC_SITE_ORIGIN GA_MEASUREMENT_ID

  npm run build -w @gagnechris/web
  npm run --silent check:web-shells
fi

# The publisher renders from this pristine shell; index.html seeds `/` in a
# bucket the publisher hasn't written yet.
for required in index.html _shell.html; do
  if [ ! -f "${DIST}/${required}" ]; then
    echo "Missing build output: ${DIST}/${required}" >&2
    exit 1
  fi
done

if [ "${MODE}" = build ]; then
  echo "Web build complete."
  exit 0
fi

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

# Excludes protect keys this sync doesn't own from --delete: the publisher's
# output (generated from its targets), hashed assets and fonts uploaded above,
# and admin media. Anything else the public build doesn't produce is deleted.
# .vite/ is the build manifest check:web-shells reads; it is not part of the
# site.
SYNC_EXCLUDES=(
  --exclude ".vite/*"
  --exclude "assets/*"
  --exclude "fonts/*.woff2"
  --exclude "media/*"
)
while IFS= read -r pattern; do
  [[ -z "${pattern}" || "${pattern}" == \#* ]] && continue
  SYNC_EXCLUDES+=(--exclude "${pattern}")
done < "${ROOT}/scripts/publisher-owned-paths.generated.txt"

aws s3 sync "${DIST}/" "s3://${BUCKET}/" \
  --region "${AWS_REGION}" \
  --delete \
  "${SYNC_EXCLUDES[@]}" \
  --cache-control "public,max-age=0,must-revalidate" \
  --metadata-directive REPLACE

# index.html is the publisher's home page (excluded from the sync above). The
# build's copy only seeds a bucket that has none, so a failed republish leaves
# the last good prerender on `/`, not the empty shell.
apex_has_index() {
  local err
  if err="$(aws s3api head-object --bucket "${BUCKET}" --key index.html \
    --region "${AWS_REGION}" 2>&1 >/dev/null)"; then
    return 0
  fi
  if [[ "${err}" == *"(404)"* ]]; then
    return 1
  fi
  echo "${err}" >&2
  exit 1
}
if ! apex_has_index; then
  echo "Seeding index.html (the bucket has no home page yet)"
  aws s3 cp "${DIST}/index.html" "s3://${BUCKET}/index.html" \
    --region "${AWS_REGION}" \
    --cache-control "public,max-age=0,must-revalidate" \
    --metadata-directive REPLACE
fi

upload_well_known "${DIST}" "${BUCKET}"
invalidate "${DISTRIBUTION_ID}"

# Re-render publisher pages against the new shell. `aws lambda invoke` exits 0
# even when the function throws, so check FunctionError.
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

echo "Web deploy complete."
