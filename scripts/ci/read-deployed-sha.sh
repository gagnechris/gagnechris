#!/usr/bin/env bash
# Print the last deployed commit SHA from SSM (CHR-149), or print nothing when
# the parameter does not exist yet (first deploy).
#
# Fails closed (CHR-200): any other SSM error (throttling, AccessDenied,
# expired credentials, network) or a value that is not a 40-hex SHA exits
# non-zero, so the deploy cannot fall back to "deploy everything and skip the
# rollback check" because a read failed.
#
# Usage (AWS credentials and region in the environment):
#   scripts/ci/read-deployed-sha.sh [envName]
set -euo pipefail

ENV_NAME="${1:-prod}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PARAM="$(bash "${ROOT}/scripts/ssm-param-name.sh" "${ENV_NAME}" deployedSha)"

err="$(mktemp)"
trap 'rm -f "${err}"' EXIT

if value="$(aws ssm get-parameter \
  --name "${PARAM}" \
  --query 'Parameter.Value' \
  --output text 2>"${err}")"; then
  if [[ ! "${value}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "error: ${PARAM} holds '${value}', not a commit SHA" >&2
    exit 1
  fi
  printf '%s\n' "${value}"
  exit 0
fi

if grep -q '(ParameterNotFound)' "${err}"; then
  echo "${PARAM} not found (first deploy)" >&2
  exit 0
fi

echo "error: reading ${PARAM} failed:" >&2
cat "${err}" >&2
exit 1
