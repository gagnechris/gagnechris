#!/usr/bin/env bash
# Prints nothing only on ParameterNotFound (first deploy). Any other failure
# exits non-zero so a failed read cannot skip the rollback check.
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
