#!/usr/bin/env bash
# Print full SSM parameter path from infra/lib/config/ssm-params.json.
# Usage: scripts/ssm-param-name.sh <envName> <camelCaseKey>
set -euo pipefail

ENV_NAME="${1:?env name (e.g. prod)}"
KEY="${2:?SSM key from ssm-params.json keys}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSM_JSON="${ROOT}/infra/lib/config/ssm-params.json"

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
" "${SSM_JSON}" "${ENV_NAME}" "${KEY}"
