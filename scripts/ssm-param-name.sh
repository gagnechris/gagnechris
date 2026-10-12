#!/usr/bin/env bash
# Run:    scripts/ssm-param-name.sh <envName> <camelCaseKey>
# Source: defines ssm_param_name <envName> <camelCaseKey>
# Keys and the prefix come from infra/lib/config/ssm-params.json.

SSM_PARAMS_JSON="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/infra/lib/config/ssm-params.json"

ssm_param_name() {
  local env_name="${1:?env name (e.g. prod)}"
  local key="${2:?SSM key from ssm-params.json keys}"
  node -e "
const j = require(process.argv[1]);
const env = process.argv[2];
const key = process.argv[3];
const leaf = j.keys[key];
if (!leaf) {
  console.error('unknown SSM key: ' + key);
  process.exit(1);
}
const prefix = j.prefixTemplate.replaceAll('\${ENV_NAME}', env);
process.stdout.write(prefix + '/' + leaf);
" "${SSM_PARAMS_JSON}" "${env_name}" "${key}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  ssm_param_name "$@"
fi
