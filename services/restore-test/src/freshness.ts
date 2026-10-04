// AWS Backup emits no event when nothing happens: no backup job, no eligible
// recovery point for the restore test, or a validate rule that never matches.
// So the daily check asks AWS Backup what last succeeded.

export const RECOVERY_POINT_MAX_AGE_HOURS = 26;
export const RESTORE_VALIDATION_MAX_AGE_DAYS = 8;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type BackupFreshnessDeps = {
  newestRecoveryPoint: (createdAfter: Date) => Promise<Date | undefined>;
  newestSuccessfulValidation: (createdAfter: Date) => Promise<Date | undefined>;
  /** undefined when the plan does not exist. */
  restoreTestingPlanCreatedAt: () => Promise<Date | undefined>;
  dynamoDbAdvancedBackupEnabled: () => Promise<boolean>;
};

export type BackupFreshness = {
  recoveryPointAgeHours?: number;
  staleRecoveryPoint: boolean;
  validationAgeDays?: number;
  validationMissing: boolean;
  advancedBackupDisabled: boolean;
};

const ageIn = (now: Date, then: Date | undefined, unitMs: number) =>
  then === undefined
    ? undefined
    : Math.floor((now.getTime() - then.getTime()) / unitMs);

export async function checkBackupFreshness(
  deps: BackupFreshnessDeps,
  now: Date,
): Promise<BackupFreshness> {
  const pointMaxMs = RECOVERY_POINT_MAX_AGE_HOURS * HOUR_MS;
  const validationMaxMs = RESTORE_VALIDATION_MAX_AGE_DAYS * DAY_MS;

  const newestPoint = await deps.newestRecoveryPoint(
    new Date(now.getTime() - 2 * pointMaxMs),
  );
  const staleRecoveryPoint =
    newestPoint === undefined ||
    now.getTime() - newestPoint.getTime() >= pointMaxMs;

  const lastSuccess = await deps.newestSuccessfulValidation(
    new Date(now.getTime() - 2 * validationMaxMs),
  );
  const planCreatedAt = await deps.restoreTestingPlanCreatedAt();
  const recentSuccess =
    lastSuccess !== undefined &&
    now.getTime() - lastSuccess.getTime() <= validationMaxMs;
  // A new plan has not had its first run yet; a deleted plan never will.
  const planIsNew =
    planCreatedAt !== undefined &&
    now.getTime() - planCreatedAt.getTime() <= validationMaxMs;
  const validationMissing = !recentSuccess && !planIsNew;

  const advancedBackupDisabled = !(await deps.dynamoDbAdvancedBackupEnabled());

  return {
    ...(newestPoint
      ? { recoveryPointAgeHours: ageIn(now, newestPoint, HOUR_MS) }
      : {}),
    staleRecoveryPoint,
    ...(lastSuccess
      ? { validationAgeDays: ageIn(now, lastSuccess, DAY_MS) }
      : {}),
    validationMissing,
    advancedBackupDisabled,
  };
}
