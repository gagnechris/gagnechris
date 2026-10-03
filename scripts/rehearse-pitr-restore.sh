#!/usr/bin/env bash
# Manual PITR restore rehearsal into a tagged scratch table (CHR-175 / CHR-198).
#
# Run from the manual "PITR restore rehearsal" workflow (pitr-rehearsal.yml) or
# break-glass locally. Never runs on deploy: the weekly AWS Backup restore test
# (Data-prod) is the scheduled proof. Does not touch gagnechris-prod beyond
# reading keys + version/updatedAt.
#
# - Restores to a FIXED point in time (the source's latest restorable time,
#   captured once up front), not --use-latest-restorable-time.
# - Verifies content that is stable at that time: a sample of rows whose
#   updatedAt is older than the restore point (minus a margin) must exist in
#   the restore with the same version/updatedAt, plus the singleton rows.
#   No live-count compare, so autosaves / TTL expiry during the run cannot
#   cause a false mismatch.
# - Keeps the prod encryption (AWS-managed KMS key aws/dynamodb) via
#   --sse-specification-override, and tags the scratch table.
# - A trap deletes the scratch table on EVERY exit (success, failure, timeout,
#   Ctrl-C) unless KEEP_TARGET=1. A kept table is tagged keep=true and the
#   daily leftover check alarms on it after 24 h.
# - Prints counts only: never item content or keys (Actions logs are visible).
#
# Env: SOURCE_TABLE (gagnechris-prod), AWS_REGION (us-east-1), KEEP_TARGET (0),
#      FORCE_FAIL (0; 1 fails after verification to prove cleanup),
#      SAMPLE_SIZE (25), ACTIVE_TIMEOUT_MIN (45), TARGET_TABLE (generated).
set -euo pipefail

SOURCE="${SOURCE_TABLE:-gagnechris-prod}"
REGION="${AWS_REGION:-us-east-1}"
STAMP="${RESTORE_STAMP:-$(date -u +%Y%m%d%H%M%S)}"
TARGET="${TARGET_TABLE:-${SOURCE}-restore-${STAMP}}"
KEEP_TARGET="${KEEP_TARGET:-0}"
FORCE_FAIL="${FORCE_FAIL:-0}"
SAMPLE_SIZE="${SAMPLE_SIZE:-25}"
ACTIVE_TIMEOUT_MIN="${ACTIVE_TIMEOUT_MIN:-45}"
# Rows updated within this many seconds before the restore point are skipped:
# a write's updatedAt is stamped before it commits (Lambda timeout is 10 s).
SETTLE_SEC=60
CREATED_BY="${GITHUB_ACTOR:-${USER:-unknown}}"
# Singleton rows every restore must contain (keys from @gagnechris/data).
REQUIRED_KEYS=('HOME#current|META' 'RESUME#current|META')

WORK="$(mktemp -d)"
CREATED=0
RESULT="FAILED"
REASON=""
START_EPOCH="$(date -u +%s)"

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
fail() {
  REASON="$*"
  echo "ERROR: $*" >&2
  exit 1
}

table_status() {
  aws dynamodb describe-table --table-name "${TARGET}" --region "${REGION}" \
    --query 'Table.TableStatus' --output text 2>/dev/null || echo 'GONE'
}

tag_target() {
  local arn
  arn="$(aws dynamodb describe-table --table-name "${TARGET}" \
    --region "${REGION}" --query 'Table.TableArn' --output text)"
  aws dynamodb tag-resource --region "${REGION}" --resource-arn "${arn}" \
    --tags \
    "Key=purpose,Value=restore-rehearsal" \
    "Key=created-by,Value=${CREATED_BY}" \
    "Key=source-table,Value=${SOURCE}" \
    "Key=restore-date-time,Value=${RESTORE_AT:-unknown}" \
    "Key=keep,Value=$([[ "${KEEP_TARGET}" == "1" ]] && echo true || echo false)"
}

cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  set +e
  if [[ "${CREATED}" == "1" ]]; then
    if [[ "${KEEP_TARGET}" == "1" ]]; then
      tag_target >/dev/null 2>&1
      log "KEEP_TARGET=1: leaving ${TARGET} (tagged keep=true). Delete it when done:"
      log "  aws dynamodb delete-table --table-name ${TARGET} --region ${REGION}"
      log "The daily leftover check alarms on it after 24 h."
    else
      # A restoring table cannot be deleted until it is ACTIVE.
      local status
      for _ in $(seq 1 240); do
        status="$(table_status)"
        [[ "${status}" == "CREATING" ]] || break
        sleep 15
      done
      if [[ "${status}" == "GONE" ]]; then
        log "Scratch table ${TARGET} does not exist; nothing to delete."
      elif aws dynamodb delete-table --table-name "${TARGET}" \
        --region "${REGION}" >/dev/null; then
        aws dynamodb wait table-not-exists --table-name "${TARGET}" \
          --region "${REGION}" || true
        log "Deleted scratch table ${TARGET}."
      else
        echo "CLEANUP FAILED: delete ${TARGET} by hand (status=${status})." >&2
        rc=1
      fi
    fi
  fi
  rm -rf "${WORK}"
  local duration=$(($(date -u +%s) - START_EPOCH))
  if [[ "${RESULT}" == "OK" && "${rc}" == "0" ]]; then
    echo "REHEARSAL_OK target=${TARGET} restore_at=${RESTORE_AT:-?} sampled=${SAMPLED:-0} restored_count=${DST_COUNT:-?} duration_sec=${duration} kept=${KEEP_TARGET}"
  else
    echo "REHEARSAL_FAILED target=${TARGET} reason=${REASON:-exit ${rc}} duration_sec=${duration} kept=${KEEP_TARGET}"
    [[ "${rc}" == "0" ]] && rc=1
  fi
  exit "${rc}"
}
trap cleanup EXIT
trap 'REASON="interrupted"; exit 130' INT TERM

command -v jq >/dev/null || fail "jq is required"

echo "Source table:  ${SOURCE}"
echo "Target table:  ${TARGET}"
echo "Region:        ${REGION}"

[[ "${TARGET}" != "${SOURCE}" ]] || fail "refusing to restore onto the live table name"
# Keep the name inside the leftover check / IAM pattern gagnechris-*-restore-*.
[[ "${TARGET}" == "${SOURCE}-restore-"* ]] ||
  fail "target must be named ${SOURCE}-restore-*"

# 1) Fix the restore point once, up front.
LATEST="$(aws dynamodb describe-continuous-backups --table-name "${SOURCE}" \
  --region "${REGION}" \
  --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.LatestRestorableDateTime' \
  --output text)"
RESTORE_EPOCH="$(date -u -d "${LATEST}" +%s)" || fail "cannot parse ${LATEST}"
RESTORE_AT="$(date -u -d "@${RESTORE_EPOCH}" +%Y-%m-%dT%H:%M:%SZ)"
log "Restore point (fixed): ${RESTORE_AT}"

# 2) Sample rows that have not changed since well before the restore point.
#    Projection = keys + version/updatedAt only (no content).
aws dynamodb scan --table-name "${SOURCE}" --region "${REGION}" \
  --projection-expression 'pk, sk, #v, updatedAt' \
  --expression-attribute-names '{"#v":"version"}' \
  --output json >"${WORK}/source.json"
CUTOFF=$((RESTORE_EPOCH - SETTLE_SEC))
jq --argjson cutoff "${CUTOFF}" --argjson n "${SAMPLE_SIZE}" '
  [ .Items[]
    | select(.updatedAt.S != null)
    | select((.updatedAt.S | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) <= $cutoff)
  ] | .[:$n]' "${WORK}/source.json" >"${WORK}/sample.json"
SAMPLED="$(jq 'length' "${WORK}/sample.json")"
STABLE_TOTAL="$(jq --argjson cutoff "${CUTOFF}" '[.Items[]
  | select(.updatedAt.S != null)
  | select((.updatedAt.S | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) <= $cutoff)
  ] | length' "${WORK}/source.json")"
log "Stable rows at restore point: ${STABLE_TOTAL}; sampled ${SAMPLED}"
[[ "${SAMPLED}" -gt 0 ]] || fail "no rows older than the restore point to sample"

# 3) Restore with the prod encryption (SSEType=KMS without a key id = the
#    AWS-managed aws/dynamodb key, matching TableEncryption.AWS_MANAGED).
log "Starting PITR restore to ${RESTORE_AT}..."
CREATED=1
aws dynamodb restore-table-to-point-in-time \
  --region "${REGION}" \
  --source-table-name "${SOURCE}" \
  --target-table-name "${TARGET}" \
  --restore-date-time "${RESTORE_AT}" \
  --sse-specification-override Enabled=true,SSEType=KMS >/dev/null

log "Waiting for ${TARGET} to become ACTIVE (max ${ACTIVE_TIMEOUT_MIN} min)..."
STATUS="CREATING"
for _ in $(seq 1 $((ACTIVE_TIMEOUT_MIN * 4))); do
  STATUS="$(table_status)"
  [[ "${STATUS}" == "ACTIVE" ]] && break
  sleep 15
done
[[ "${STATUS}" == "ACTIVE" ]] || fail "timed out waiting for ACTIVE (last status=${STATUS})"
tag_target
log "ACTIVE and tagged after $(($(date -u +%s) - START_EPOCH)) s."

# 4) Verify.
SSE="$(aws dynamodb describe-table --table-name "${TARGET}" --region "${REGION}" \
  --query 'Table.SSEDescription.SSEType' --output text)"
[[ "${SSE}" == "KMS" ]] || fail "restored table SSEType=${SSE}, expected KMS"

MISSING=0
for key in "${REQUIRED_KEYS[@]}"; do
  pk="${key%%|*}"
  sk="${key#*|}"
  found="$(aws dynamodb get-item --table-name "${TARGET}" --region "${REGION}" \
    --consistent-read --projection-expression pk \
    --key "$(jq -nc --arg pk "${pk}" --arg sk "${sk}" '{pk:{S:$pk},sk:{S:$sk}}')" \
    --output json | jq 'has("Item")')"
  [[ "${found}" == "true" ]] || MISSING=$((MISSING + 1))
done
[[ "${MISSING}" == "0" ]] || fail "${MISSING} singleton row(s) missing from the restore"

MISMATCH=0
while IFS= read -r row; do
  key="$(jq -c '{pk, sk}' <<<"${row}")"
  want="$(jq -c '{v: .version.N, u: .updatedAt.S}' <<<"${row}")"
  got="$(aws dynamodb get-item --table-name "${TARGET}" --region "${REGION}" \
    --consistent-read --projection-expression 'pk, #v, updatedAt' \
    --expression-attribute-names '{"#v":"version"}' \
    --key "${key}" --output json |
    jq -c '{v: .Item.version.N, u: .Item.updatedAt.S}')"
  [[ "${want}" == "${got}" ]] || MISMATCH=$((MISMATCH + 1))
done < <(jq -c '.[]' "${WORK}/sample.json")
[[ "${MISMATCH}" == "0" ]] ||
  fail "${MISMATCH} of ${SAMPLED} sampled row(s) differ in the restore"

DST_COUNT="$(aws dynamodb scan --table-name "${TARGET}" --region "${REGION}" \
  --select COUNT --query 'Count' --output text)"
[[ "${DST_COUNT}" -gt 0 ]] || fail "restored table is empty"
log "Verified: ${SAMPLED} sampled rows match, singletons present, ${DST_COUNT} items."

if [[ "${FORCE_FAIL}" == "1" ]]; then
  fail "forced failure (FORCE_FAIL=1) to prove the scratch table is still deleted"
fi

RESULT="OK"
