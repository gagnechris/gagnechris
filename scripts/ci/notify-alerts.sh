#!/usr/bin/env bash
# Publishes to the alerts SNS topic (email subscribers), read from the
# alertsTopicArn SSM parameter. Usage (AWS credentials and region in the
# environment):
#   scripts/ci/notify-alerts.sh <subject> <message> [envName]
set -euo pipefail

SUBJECT="${1:?subject}"
MESSAGE="${2:?message}"
ENV_NAME="${3:-prod}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

PARAM="$(bash "${ROOT}/scripts/ssm-param-name.sh" "${ENV_NAME}" alertsTopicArn)"
TOPIC_ARN="$(aws ssm get-parameter \
  --name "${PARAM}" \
  --query 'Parameter.Value' \
  --output text)"

aws sns publish \
  --topic-arn "${TOPIC_ARN}" \
  --subject "${SUBJECT}" \
  --message "${MESSAGE}"
