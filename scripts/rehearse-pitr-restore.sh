#!/usr/bin/env bash
# PITR restore rehearsal into a scratch table (CHR-175).
# Does not rename or delete gagnechris-prod. Safe to run from CI with the
# deploy role, or break-glass admin (record use in infra/RUNBOOK.md).
set -euo pipefail

SOURCE="${SOURCE_TABLE:-gagnechris-prod}"
REGION="${AWS_REGION:-us-east-1}"
STAMP="${RESTORE_STAMP:-$(date -u +%Y%m%d%H%M%S)}"
TARGET="${TARGET_TABLE:-${SOURCE}-restore-${STAMP}}"
KEEP_TARGET="${KEEP_TARGET:-0}"

echo "Source table:  ${SOURCE}"
echo "Target table:  ${TARGET}"
echo "Region:        ${REGION}"

if [[ "${TARGET}" == "${SOURCE}" ]]; then
  echo "Refusing to restore onto the live table name." >&2
  exit 1
fi

echo "Counting source items (Scan SELECT COUNT)…"
SRC_COUNT="$(aws dynamodb scan \
  --table-name "${SOURCE}" \
  --region "${REGION}" \
  --select COUNT \
  --query 'Count' \
  --output text)"
echo "Source Count=${SRC_COUNT}"

echo "Starting PITR restore (use latest restorable time)…"
START_EPOCH="$(date -u +%s)"
aws dynamodb restore-table-to-point-in-time \
  --region "${REGION}" \
  --source-table-name "${SOURCE}" \
  --target-table-name "${TARGET}" \
  --use-latest-restorable-time

echo "Waiting for ${TARGET} to become ACTIVE…"
for _ in $(seq 1 120); do
  STATUS="$(aws dynamodb describe-table \
    --table-name "${TARGET}" \
    --region "${REGION}" \
    --query 'Table.TableStatus' \
    --output text 2>/dev/null || echo 'CREATING')"
  if [[ "${STATUS}" == "ACTIVE" ]]; then
    break
  fi
  sleep 15
done
if [[ "${STATUS}" != "ACTIVE" ]]; then
  echo "Timed out waiting for ACTIVE (last status=${STATUS})." >&2
  exit 1
fi
END_EPOCH="$(date -u +%s)"
DURATION_SEC="$((END_EPOCH - START_EPOCH))"

echo "Counting restored items…"
DST_COUNT="$(aws dynamodb scan \
  --table-name "${TARGET}" \
  --region "${REGION}" \
  --select COUNT \
  --query 'Count' \
  --output text)"
echo "Restored Count=${DST_COUNT}"

if [[ "${SRC_COUNT}" != "${DST_COUNT}" ]]; then
  echo "COUNT MISMATCH source=${SRC_COUNT} restored=${DST_COUNT}" >&2
  exit 1
fi

echo "REHEARSAL_OK source=${SRC_COUNT} restored=${DST_COUNT} target=${TARGET} duration_sec=${DURATION_SEC}"

if [[ "${KEEP_TARGET}" == "1" ]]; then
  echo "KEEP_TARGET=1 — leaving ${TARGET} in place."
  exit 0
fi

echo "Deleting scratch table ${TARGET}…"
aws dynamodb delete-table --table-name "${TARGET}" --region "${REGION}" >/dev/null
echo "Scratch table delete initiated."
